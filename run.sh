#!/usr/bin/env bash
#
# Brings the whole thing up: PostgreSQL, Elasticsearch, the API and the app.
#
#   ./run.sh          set everything up and run it; Ctrl+C stops it again
#   ./run.sh --yes    the same, installing anything missing without asking first
#   ./run.sh stop     stop what this script started
#   ./run.sh reset    stop, then delete the database and the search index
#
# Safe to re-run: every step checks what is already there first, and anything still holding a port
# it needs is stopped rather than reported.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# Nothing here needs privileges, and initdb refuses to run as root anyway. What sudo does achieve is
# leaving root-owned dist/, node_modules/ and .pgdata/ behind that your own user then cannot delete.
if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  echo 'error  do not run this with sudo: it needs no privileges, and running as root leaves' >&2
  echo '       root-owned files behind that your own user cannot remove afterwards.' >&2
  exit 1
fi

# Git Bash, MSYS and Cygwin look POSIX enough to get a long way in before failing in ways that are
# hard to read: Windows PostgreSQL has no unix sockets, Docker Desktop needs WSL2 anyway, and the
# process groups this script stops servers with do not behave. Say so here instead.
case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*)
    cat >&2 <<'WINDOWS'
error  this is Git Bash on Windows, which cannot run the stack: Windows PostgreSQL has no unix
       sockets, and Docker Desktop needs WSL2 regardless. Use WSL2, where everything works as it
       does on Linux.

       1. In PowerShell as administrator:   wsl --install -d Ubuntu
       2. Reboot, then open Ubuntu.
       3. Install Docker Desktop on Windows and turn on
          Settings > Resources > WSL Integration > Ubuntu.
       4. Clone into the Linux filesystem, not /mnt/c — npm is far slower there and file
          watching does not work:
          cd ~ && git clone https://github.com/sb2dev/linkedin-tools.git && cd linkedin-tools
       5. ./run.sh

       The script installs Node and PostgreSQL itself once it is inside Ubuntu.
WINDOWS
    exit 1
    ;;
esac

readonly PGPORT=5433
# Where the cluster lives is decided at run time: a Windows drive mounted into WSL cannot hold
# 0700 permissions, and PostgreSQL refuses a data directory it cannot lock down. See choose_pgdata.
PGDATA=.pgdata
# The same mount that cannot hold those permissions is also slow to compile on and cannot deliver
# file-change events. Both matter after PostgreSQL, so the discovery is kept rather than repeated.
SLOW_FS=false
readonly PGUSER_NAME=linkedin
readonly PGDB=linkedin
readonly API_PORT=3100
readonly APP_PORT=5173
readonly ES_PORT=9200
# Absolute on purpose: several steps run inside a subshell that has changed directory, and a
# relative log path silently becomes a different, missing one there.
readonly LOGS="$PWD/.run"

# --- output ----------------------------------------------------------------

if [[ -t 1 ]]; then
  readonly DIM=$'\e[2m' BOLD=$'\e[1m' GREEN=$'\e[32m' RED=$'\e[31m' YELLOW=$'\e[33m' OFF=$'\e[0m'
else
  readonly DIM='' BOLD='' GREEN='' RED='' YELLOW='' OFF=''
fi

step() { printf '%s==>%s %s\n' "$BOLD" "$OFF" "$1"; }
ok()   { printf '    %sok%s   %s\n' "$GREEN" "$OFF" "$1"; }
info() { printf '    %s%s%s\n' "$DIM" "$1" "$OFF"; }
warn() { printf '    %swarn%s %s\n' "$YELLOW" "$OFF" "$1"; }
die()  { printf '%serror%s %s\n' "$RED" "$OFF" "$1" >&2; exit 1; }

# --- small helpers ---------------------------------------------------------

listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# Polls until the command succeeds, or gives up after the given number of seconds.
await() {
  local what=$1 seconds=$2; shift 2
  for ((i = 0; i < seconds; i++)); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  die "$what did not come up within ${seconds}s. Its log is in $LOGS/."
}

# Zombies still answer `kill -0`, and a background job stays one until it is reaped, so a dead
# server would otherwise look alive for the rest of the timeout.
process_gone() {
  local pid=$1 state
  kill -0 "$pid" 2>/dev/null || return 0
  state=$(ps -o stat= -p "$pid" 2>/dev/null | tr -d ' ') || return 1
  [[ $state == Z* ]]
}

# Naming the log file asks the reader to go and find it; the reason is almost always in its last
# few lines, so print those. Colour codes are stripped because these logs are written to a file.
report_log() {
  local headline=$1 log=$2
  printf '%serror%s %s\n' "$RED" "$OFF" "$headline" >&2
  if [[ -s $log ]]; then
    printf '    %slast lines of %s:%s\n' "$DIM" "${log#"$PWD"/}" "$OFF" >&2
    sed -e 's/\x1b\[[0-9;]*m//g' "$log" | grep -v '^[[:space:]]*$' | tail -15 | sed 's/^/    /' >&2
  else
    printf '    %s is empty, so it did not get far enough to say why.\n' "${log#"$PWD"/}" >&2
  fi
  exit 1
}

# await(), for a server this script started: it stops the moment the process is gone instead of
# waiting out a timeout that cannot succeed, and it shows the log either way.
await_service() {
  local what=$1 seconds=$2 pid=$3 log=$4; shift 4
  for ((i = 0; i < seconds; i++)); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    process_gone "$pid" && report_log "$what exited before it finished starting." "$log"
    sleep 1
  done
  report_log "$what did not come up within ${seconds}s." "$log"
}

# Stops whatever actually holds a port, by process group so a server started through npm takes
# its children with it. More reliable than matching a command line, which differs between watch
# mode (an absolute path, from the Nest CLI) and a built server (`node dist/main`, relative).
stop_listener() {
  local port=$1 pids pid pgid i
  listening "$port" || return 1
  pids=$(listeners_on "$port")
  [[ -n ${pids// /} ]] || return 1

  for pid in $pids; do
    pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ') || true
    kill -TERM -- "-${pgid:-$pid}" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  for ((i = 0; i < 10; i++)); do listening "$port" || return 0; sleep 1; done

  for pid in $pids; do kill -KILL "$pid" 2>/dev/null || true; done
  sleep 1
  ! listening "$port"
}

# Every PID listening on a port, whichever of the two tools this machine has.
listeners_on() {
  local port=$1 pids
  pids=$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null) || true
  [[ -n $pids ]] || pids=$(ss -ltnpH "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2) || true
  echo "$pids" | sort -u | tr '\n' ' '
}

# Takes down whatever holds a port this script needs. The usual cause is a server an earlier run
# left behind, and refusing to start until the reader hunts it down helps nobody.
free_port() {
  local port=$1 label=$2 pids pid pgid
  if ! listening "$port"; then return 0; fi

  pids=$(listeners_on "$port")
  if [[ -z ${pids// /} ]]; then
    die "port $port is held by a process this user cannot see, so $label cannot start.
    Run the script as the user that owns it, or stop it by hand."
  fi

  for pid in $pids; do
    info "port $port was held by $(ps -o comm= -p "$pid" 2>/dev/null || echo 'something') (pid $pid)"
    pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ') || true
    # The group, so a server started through npm takes its children with it.
    kill -TERM -- "-${pgid:-$pid}" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done

  for ((i = 0; i < 10; i++)); do
    if ! listening "$port"; then ok "port $port freed"; return 0; fi
    sleep 1
  done

  for pid in $pids; do kill -KILL "$pid" 2>/dev/null || true; done
  sleep 1
  if listening "$port"; then die "port $port could not be freed, so $label cannot start."; fi
  ok "port $port freed"
}

# Compose ships two ways: as the `docker compose` plugin, and as the older standalone
# `docker-compose`. Either will do, so the one that is present is found once and used everywhere.
COMPOSE=()
resolve_compose() {
  [[ ${#COMPOSE[@]} -gt 0 ]] && return 0
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    return 1
  fi
}

compose() {
  resolve_compose || die 'Compose is not installed. See the prerequisites in the README.'
  dock "${COMPOSE[@]}" "$@"
}

# Everything that talks to the daemon goes through here, so the sudo fallback applies once.
dock() {
  if [[ -n ${DOCKER_SUDO:-} ]]; then "$DOCKER_SUDO" "$@"; else "$@"; fi
}

# PostgreSQL's server binaries are usually off PATH; the client ones usually are not. Where several
# versions are installed the newest wins, and each candidate is asked its own version rather than
# having one read out of its path, which differs on every platform.
find_pg_bin() {
  local name=$1 candidate best='' best_version=0 version
  if candidate=$(command -v "$name" 2>/dev/null); then echo "$candidate"; return; fi

  for candidate in /usr/lib/postgresql/*/bin/"$name" \
                   /usr/pgsql-*/bin/"$name" \
                   /opt/homebrew/opt/postgresql*/bin/"$name" \
                   /usr/local/opt/postgresql*/bin/"$name" \
                   /Applications/Postgres.app/Contents/Versions/*/bin/"$name"; do
    [[ -x $candidate ]] || continue
    version=$("$candidate" --version 2>/dev/null | grep -oE '[0-9]+' | head -1) || continue
    [[ -n $version ]] || continue
    if (( version > best_version )); then best_version=$version; best=$candidate; fi
  done

  [[ -n $best ]] && echo "$best"
}

# --- installing what is missing --------------------------------------------

# Set by --yes, for an unattended run.
ASSUME_YES=false

# The package manager to drive, or empty where we would only be guessing. On macOS everything goes
# through Homebrew, which is itself installable, so its absence is reported separately.
package_manager() {
  if [[ $OSTYPE == darwin* ]]; then
    if command -v brew >/dev/null; then echo brew; else echo brew-missing; fi
  elif command -v apt-get >/dev/null; then echo apt
  elif command -v dnf >/dev/null;     then echo dnf
  elif command -v yum >/dev/null;     then echo yum
  elif command -v zypper >/dev/null;  then echo zypper
  elif command -v pacman >/dev/null;  then echo pacman
  elif command -v apk >/dev/null;     then echo apk
  fi
}

install_homebrew() {
  may_install 'Homebrew, which macOS needs to install the rest' \
    || manual 'Homebrew is how this installs things on macOS. Install it from https://brew.sh and run this again.'
  NONINTERACTIVE=1 /bin/bash -c \
    "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" >>"$LOGS/setup.log" 2>&1
  # A fresh install is not on PATH until the next shell.
  [[ -x /opt/homebrew/bin/brew ]] && eval "$(/opt/homebrew/bin/brew shellenv)"
  [[ -x /usr/local/bin/brew ]] && eval "$(/usr/local/bin/brew shellenv)"
  command -v brew >/dev/null || manual "Homebrew did not install. See $LOGS/setup.log"
}

# Called before anything is installed, so macOS reaches the rest of this with a working brew.
ensure_package_manager() {
  [[ $(package_manager) == brew-missing ]] || return 0
  install_homebrew
}

# What to tell someone whose machine this script cannot drive.
no_package_manager() {
  manual "this script knows apt, dnf, yum, zypper, pacman, apk and Homebrew, and found none of them
    on this machine ($(uname -s)). Install $1 yourself and run this again:
    Node:       https://nodejs.org
    PostgreSQL: https://www.postgresql.org/download/
    Docker:     https://docs.docker.com/engine/install/"
}

# Installing on someone else's machine is not something to do quietly.
may_install() {
  local what=$1
  if $ASSUME_YES; then
    info "installing $what"
    return 0
  fi
  # No terminal to ask on: an unattended run has to say so rather than hang or guess.
  if ! { : </dev/tty; } 2>/dev/null; then
    warn "$what is missing, and there is no terminal to ask on. Re-run with --yes to install it."
    return 1
  fi

  printf '    %s%s is missing.%s Install it now? [y/N] ' "$BOLD" "$what" "$OFF"
  local answer=''
  { read -r answer </dev/tty; } 2>/dev/null || return 1
  [[ $answer == [yY]* ]]
}

# One place for "we cannot do this for you, and here is exactly what to do".
manual() { die "$1"; }

run_root() {
  mkdir -p "$LOGS"
  if command -v sudo >/dev/null; then sudo "$@"; else die "this needs root and sudo is not installed: $*"; fi
}

install_node() {
  case "$(package_manager)" in
    apt)
      curl -fsSL https://deb.nodesource.com/setup_20.x | run_root -E bash - >>"$LOGS/setup.log" 2>&1
      run_root apt-get install -y nodejs >>"$LOGS/setup.log" 2>&1
      ;;
    dnf)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | run_root bash - >>"$LOGS/setup.log" 2>&1
      run_root dnf install -y nodejs >>"$LOGS/setup.log" 2>&1
      ;;
    yum)    curl -fsSL https://rpm.nodesource.com/setup_20.x | run_root bash - >>"$LOGS/setup.log" 2>&1
            run_root yum install -y nodejs >>"$LOGS/setup.log" 2>&1 ;;
    zypper) run_root zypper --non-interactive install nodejs20 npm20 >>"$LOGS/setup.log" 2>&1 ;;
    pacman) run_root pacman -Sy --noconfirm nodejs npm >>"$LOGS/setup.log" 2>&1 ;;
    apk)    run_root apk add --no-cache nodejs npm >>"$LOGS/setup.log" 2>&1 ;;
    brew)   brew install node@20 >>"$LOGS/setup.log" 2>&1; brew link --overwrite --force node@20 >>"$LOGS/setup.log" 2>&1 ;;
    *)      no_package_manager 'Node 20 or newer' ;;
  esac
}

install_postgres() {
  case "$(package_manager)" in
    apt)    run_root apt-get update >>"$LOGS/setup.log" 2>&1
            run_root apt-get install -y postgresql postgresql-client >>"$LOGS/setup.log" 2>&1 ;;
    dnf)    run_root dnf install -y postgresql-server postgresql >>"$LOGS/setup.log" 2>&1 ;;
    yum)    run_root yum install -y postgresql-server postgresql >>"$LOGS/setup.log" 2>&1 ;;
    zypper) run_root zypper --non-interactive install postgresql-server postgresql >>"$LOGS/setup.log" 2>&1 ;;
    pacman) run_root pacman -Sy --noconfirm postgresql >>"$LOGS/setup.log" 2>&1 ;;
    apk)    run_root apk add --no-cache postgresql postgresql-client >>"$LOGS/setup.log" 2>&1 ;;
    brew)   brew install postgresql@16 >>"$LOGS/setup.log" 2>&1 ;;
    *)      no_package_manager 'PostgreSQL 14 or newer' ;;
  esac
}

# Docker is the one prerequisite that cannot always be finished without a person: the desktop
# builds want a licence accepted, and a fresh docker group only applies to a new login.
install_docker() {
  case "$(package_manager)" in
    apt|dnf|yum|zypper|pacman|apk)
      curl -fsSL https://get.docker.com | run_root sh >>"$LOGS/setup.log" 2>&1
      run_root systemctl enable --now docker >>"$LOGS/setup.log" 2>&1 || true
      run_root usermod -aG docker "$USER" >>"$LOGS/setup.log" 2>&1 || true
      ;;
    brew)
      brew install --cask docker >>"$LOGS/setup.log" 2>&1
      info 'opening Docker Desktop; accept its licence if it asks'
      open -a Docker >>"$LOGS/setup.log" 2>&1 || true
      ;;
    *)
      no_package_manager 'Docker'
      ;;
  esac
}

# What Docker says when it will not answer. Its own stderr names the cause exactly -- permission
# denied, no socket, an unknown context -- so it is kept rather than thrown away. The three-way
# guess this used to print in its place sent people to log out and back in over a stopped service.
docker_error() { docker info 2>&1 >/dev/null | grep -v '^[[:space:]]*$' | tail -3; }

# The group that owns the socket, which is not `docker` on every distribution.
socket_group() { stat -c '%G' /var/run/docker.sock 2>/dev/null || echo docker; }

in_group() { id -nG 2>/dev/null | tr ' ' '\n' | grep -qx "$1"; }

# Whether waiting can help at all. A daemon still coming up answers on its own; a socket this user
# may not open, and a context pointing nowhere, never will -- and polling those for 90 seconds only
# delays the message that would have told the reader what to do.
classify_docker_error() {
  case "$1" in
    *'permission denied'*|*'Permission denied'*)     echo permission ;;
    *'context'*'not found'*|*'ontext'*'does not exist'*) echo context ;;
    *)                                               echo down ;;
  esac
}

# The daemon takes a moment after an install, and Docker Desktop rather longer than that.
await_docker_daemon() {
  local seconds=${1:-90} i
  for ((i = 0; i < seconds; i++)); do
    if docker info >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

# Same consent rules as may_install, for something that is installed but not running.
may_start() {
  local what=$1
  if $ASSUME_YES; then
    info "starting $what"
    return 0
  fi
  if ! { : </dev/tty; } 2>/dev/null; then
    warn "$what is not running, and there is no terminal to ask on. Re-run with --yes to start it."
    return 1
  fi
  printf '    %s%s is not running.%s Start it now? [y/N] ' "$BOLD" "$what" "$OFF"
  local answer=''
  { read -r answer </dev/tty; } 2>/dev/null || return 1
  [[ $answer == [yY]* ]]
}

# A group added after this login does not apply to the shell running this, and sudo is the way
# through until the reader logs in again. `sudo -n` succeeds only where sudo needs no password or
# already has one cached -- the uncommon case -- so where there is a terminal it is worth asking
# for the password rather than silently concluding that sudo is no help either.
try_sudo_docker() {
  command -v sudo >/dev/null || return 1
  if sudo -n docker info >/dev/null 2>&1; then
    DOCKER_SUDO=sudo
    warn "using sudo for docker: this login is not in the $(socket_group) group yet"
    return 0
  fi
  { : </dev/tty; } 2>/dev/null || return 1
  printf '    %sDocker will not let this user in.%s Use sudo for it this run? [y/N] ' "$BOLD" "$OFF"
  local answer=''
  { read -r answer </dev/tty; } 2>/dev/null || return 1
  [[ $answer == [yY]* ]] || return 1
  sudo docker info >/dev/null 2>&1 || return 1
  DOCKER_SUDO=sudo
  warn 'using sudo for docker; log out and back in to stop needing it'
}

# On Linux the service is ours to start. This script installs Docker itself when asked to, so
# stopping to tell the reader to go and start it by hand is a step it can take for them.
start_docker_service() {
  command -v systemctl >/dev/null || return 1
  systemctl cat docker.service >/dev/null 2>&1 || return 1
  # Already up: starting it again cannot be what is wrong, so let the caller keep looking.
  systemctl is-active --quiet docker 2>/dev/null && return 1
  may_start 'the Docker service' || return 1
  run_root systemctl start docker >>"$LOGS/setup.log" 2>&1 || return 1
  await_docker_daemon 30
}

# Installed is not the same as reachable, and the usual causes -- a stopped service, a socket this
# user may not open, a context pointing at nothing, a daemon still starting -- each want a
# different answer. What they share is that Docker already said which one it is.
ensure_docker_reachable() {
  docker info >/dev/null 2>&1 && return 0

  local err group
  err=$(docker_error) || true
  [[ -n $err ]] || err='(docker gave no reason)'
  group=$(socket_group)

  case "$(classify_docker_error "$err")" in
    permission)
      try_sudo_docker && return 0
      if in_group "$group"; then
        manual "Docker's socket refuses this user, though you are in the $group group:
    $err
    A group added after this login does not apply to it. Start a shell that has it with
    'newgrp $group', or log out and back in, then run this again."
      else
        manual "this user is not in the $group group, so it may not open Docker's socket:
    $err
    Fix it with:  sudo usermod -aG $group ${USER:-$(id -un)}
    then log out and back in, and run this again."
      fi
      ;;
    context)
      manual "Docker's context does not point at a running daemon:
    $err
    'docker context ls' lists them; 'docker context use default' picks the local one."
      ;;
    *)
      start_docker_service && return 0
      info 'waiting for the Docker daemon'
      await_docker_daemon 90 && return 0
      err=$(docker_error) || true
      [[ -n $err ]] || err='(docker gave no reason)'
      manual "the Docker daemon is not answering:
    $err
    On Linux:  sudo systemctl start docker
    On macOS or Windows, start Docker Desktop and wait for it to finish starting."
      ;;
  esac
}

# --- prerequisites ---------------------------------------------------------

DOCKER_SUDO=''

ensure_node() {
  local major=0
  if command -v node >/dev/null; then major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0); fi

  if (( major < 20 )); then
    local what='Node 20+'
    (( major > 0 )) && what="Node 20+ (this machine has $major)"
    may_install "$what" || manual 'Node 20 or newer is needed. Install it from https://nodejs.org and run this again.'
    install_node
    command -v node >/dev/null || manual 'the Node install did not take. See '"$LOGS"'/setup.log'
    major=$(node -p 'process.versions.node.split(".")[0]')
    (( major >= 20 )) || manual "Node is still $major after installing. See $LOGS/setup.log"
  fi

  command -v npm >/dev/null || manual 'npm is missing even though Node is installed.'
  ok "node $(node -v)"
}

ensure_docker() {
  if ! command -v docker >/dev/null; then
    may_install 'Docker' || manual 'Docker is needed for Elasticsearch. Install it and run this again.'
    install_docker
    command -v docker >/dev/null || manual "the Docker install did not take. See $LOGS/setup.log"
  fi

  ensure_docker_reachable

  resolve_compose || {
    may_install 'Docker Compose' || manual 'Compose is needed. Install the docker-compose-plugin package.'
    case "$(package_manager)" in
      apt)          run_root apt-get install -y docker-compose-plugin >>"$LOGS/setup.log" 2>&1 ;;
      dnf|yum)      run_root "$(package_manager)" install -y docker-compose-plugin >>"$LOGS/setup.log" 2>&1 ;;
      zypper)       run_root zypper --non-interactive install docker-compose >>"$LOGS/setup.log" 2>&1 ;;
      pacman)       run_root pacman -Sy --noconfirm docker-compose >>"$LOGS/setup.log" 2>&1 ;;
      apk)          run_root apk add --no-cache docker-cli-compose >>"$LOGS/setup.log" 2>&1 ;;
      *)            manual 'Compose ships with Docker Desktop; on Linux install docker-compose-plugin.' ;;
    esac
    resolve_compose || manual "Compose is still missing. See $LOGS/setup.log"
  }
  local engine
  engine=$(dock docker version --format '{{.Server.Version}}' 2>/dev/null | tr -d '\n') || true
  ok "docker ${engine:-ready}, compose $(compose version --short | tr -d '\n')"
}

ensure_postgres() {
  INITDB=$(find_pg_bin initdb) || true
  PG_CTL=$(find_pg_bin pg_ctl) || true

  if [[ -z ${INITDB:-} || -z ${PG_CTL:-} ]]; then
    may_install 'PostgreSQL 14+' || manual 'PostgreSQL 14 or newer is needed. Install it and run this again.'
    install_postgres
    INITDB=$(find_pg_bin initdb) || true
    PG_CTL=$(find_pg_bin pg_ctl) || true
    [[ -n ${INITDB:-} && -n ${PG_CTL:-} ]] || manual "PostgreSQL is still missing. See $LOGS/setup.log"
  fi

  command -v createdb >/dev/null || manual 'createdb is missing; install the postgresql-client package.'
  ok "postgresql $("$INITDB" --version | grep -oE '[0-9]+' | head -1)"
}

# Elasticsearch will not boot below this, and the error it gives says nothing useful.
ensure_kernel_setting() {
  [[ -r /proc/sys/vm/max_map_count ]] || return 0

  local current; current=$(cat /proc/sys/vm/max_map_count)
  if (( current < 262144 )); then
    may_install 'the vm.max_map_count kernel setting Elasticsearch needs' \
      || manual "vm.max_map_count is $current; Elasticsearch needs 262144:
    sudo sysctl -w vm.max_map_count=262144"
    run_root sysctl -w vm.max_map_count=262144 >>"$LOGS/setup.log" 2>&1
    echo 'vm.max_map_count=262144' | run_root tee /etc/sysctl.d/99-elasticsearch.conf >/dev/null 2>&1 || true
    current=$(cat /proc/sys/vm/max_map_count)
    (( current >= 262144 )) || manual "vm.max_map_count is still $current. Set it and run this again."
  fi
  ok "vm.max_map_count=$current"
}

check_prerequisites() {
  step 'Checking what is installed'
  ensure_package_manager
  ensure_node
  ensure_docker
  ensure_postgres
  ensure_kernel_setting
}

# --- postgres --------------------------------------------------------------

# True where the filesystem keeps the mode we ask for. DrvFs (/mnt/c, /mnt/d under WSL) and most
# network mounts do not, and initdb fails on them with a message about invalid permissions.
holds_unix_permissions() {
  local dir=$1 probe mode
  probe=$(mktemp -d "$dir/.permcheck.XXXXXX" 2>/dev/null) || return 1
  chmod 700 "$probe" 2>/dev/null || { rmdir "$probe"; return 1; }
  mode=$(stat -c '%a' "$probe" 2>/dev/null || stat -f '%Lp' "$probe" 2>/dev/null) || true
  rmdir "$probe"
  [[ $mode == 700 ]]
}

# Keeping the cluster beside the project is the friendly default; where that cannot work it moves
# somewhere that can, rather than refusing to start.
choose_pgdata() {
  if holds_unix_permissions .; then
    PGDATA="$PWD/.pgdata"
    return 0
  fi

  SLOW_FS=true
  PGDATA="${XDG_DATA_HOME:-$HOME/.local/share}/linkedin-search/pgdata"
  mkdir -p "$(dirname "$PGDATA")"
  warn 'this directory cannot hold unix permissions, which PostgreSQL requires of its data directory'
  info "keeping the database in $PGDATA instead"
  info 'a Windows drive also makes npm slow and breaks file watching; ~/ is a better home for this'
}


start_postgres() {
  step 'PostgreSQL'
  choose_pgdata

  if [[ ! -d $PGDATA ]]; then
    info "creating a private cluster in $PGDATA (no root, no service manager)"
    "$INITDB" -D "$PGDATA" -U "$PGUSER_NAME" --auth=trust >/dev/null
  fi

  if listening "$PGPORT"; then
    ok "already running on $PGPORT"
  else
    "$PG_CTL" -D "$PGDATA" -o "-p $PGPORT -k /tmp" -l "$PGDATA/server.log" start >/dev/null
    await "PostgreSQL on $PGPORT" 30 psql -h 127.0.0.1 -p "$PGPORT" -U "$PGUSER_NAME" -d postgres -c 'select 1'
    ok "started on $PGPORT"
  fi

  if psql -h 127.0.0.1 -p "$PGPORT" -U "$PGUSER_NAME" -d postgres -tAc \
       "select 1 from pg_database where datname='$PGDB'" | grep -q 1; then
    ok "database \"$PGDB\" is there"
  else
    createdb -h 127.0.0.1 -p "$PGPORT" -U "$PGUSER_NAME" "$PGDB"
    ok "created the database \"$PGDB\""
  fi
}

# --- elasticsearch ---------------------------------------------------------

start_elasticsearch() {
  step 'Elasticsearch'

  if curl -fsS "http://127.0.0.1:$ES_PORT" >/dev/null 2>&1; then
    ok "already answering on $ES_PORT"
    return
  fi

  info 'starting the container (the first run pulls the image, which takes a few minutes)'
  # Compose narrates on stderr; it is only worth showing when it did not work.
  compose up -d --wait >>"$LOGS/setup.log" 2>&1 \
    || die "Elasticsearch would not start. See $LOGS/setup.log"
  ok "up on $ES_PORT"
}

# --- the two node projects -------------------------------------------------

install_dependencies() {
  local project=$1
  if [[ -d $project/node_modules ]]; then
    ok "$project dependencies are installed"
  else
    info "installing $project dependencies (this takes a minute)"
    (cd "$project" && npm install --no-fund --no-audit >/dev/null)
    ok "$project dependencies installed"
  fi
}

# A `sudo ./run.sh` on an older copy of this script left build output nobody but root can rewrite,
# and the compiler only says EACCES. The directory entry can still be renamed, because that needs
# write permission on backend/ rather than on the directory itself.
clear_unwritable_build() {
  local stale
  [[ -d backend/dist && ! -w backend/dist ]] || return 0

  stale="backend/.dist-unwritable-$(date +%s)"
  if mv backend/dist "$stale" 2>/dev/null; then
    warn "backend/dist was not writable (a root-owned leftover); moved it to $stale"
    info "delete it at your leisure with: sudo rm -rf $stale"
  else
    die "backend/dist exists but cannot be written or moved. Remove it and run this again:
    sudo rm -rf backend/dist"
  fi
}

prepare_backend() {
  step 'API'

  clear_unwritable_build
  [[ -f backend/.env ]] || { cp backend/.env.example backend/.env; info 'wrote backend/.env from the example'; }
  install_dependencies backend

  info 'applying migrations'
  (cd backend && npm run --silent migration:run >>"$LOGS/setup.log" 2>&1) \
    || die "the migrations failed. See $LOGS/setup.log"
  ok 'schema is up to date'

  info 'creating the search index if it is absent'
  (cd backend && npm run --silent search:bootstrap >>"$LOGS/setup.log" 2>&1) \
    || die "the search index could not be created. See $LOGS/setup.log"
  ok 'search index is ready'
}

# --- running ---------------------------------------------------------------

API_PID=''
APP_PID=''

# npm spawns the server as a grandchild, so the whole process group has to go, not just the child.
stop_group() {
  local pid=$1
  [[ -n $pid ]] || return 1
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || return 1
}

# The status is passed in for a signal, where $? is only whatever the interrupted command left
# behind, and taken from $? on a normal exit, where it is the reason the script is ending.
shutdown() {
  local status=${1:-$?}
  trap - INT TERM EXIT
  printf '\n'
  step 'Stopping'
  stop_group "$API_PID" && ok 'API stopped'
  stop_group "$APP_PID" && ok 'app stopped'
  wait 2>/dev/null || true
  info "PostgreSQL and Elasticsearch are still up. './run.sh stop' stops those too."
  exit "$status"
}

serve() {
  step 'Starting'

  free_port "$API_PORT" 'the API'
  free_port "$APP_PORT" 'the app'

  # `nest start --watch` recompiles on change, which a Windows drive cannot report, and pays a slow
  # watch-mode startup on the filesystem that can least afford it. There it is built once instead.
  local api_script=start:dev api_wait=90 app_wait=60
  if $SLOW_FS; then
    api_script=start:prod
    api_wait=240
    app_wait=120
    info 'building the API once: this drive cannot report file changes, so watch mode buys nothing'
    (cd backend && npm run --silent build >>"$LOGS/setup.log" 2>&1) \
      || die "the API did not build. See $LOGS/setup.log"
    ok 'API built'
  fi

  # Job control gives each background job its own process group, so shutdown can take a server's
  # children with it. `setsid` would do the same but is util-linux, and macOS does not ship it.
  set -m
  (cd backend && exec npm run --silent "$api_script") >"$LOGS/backend.log" 2>&1 &
  API_PID=$!
  (cd frontend && exec npm run --silent dev) >"$LOGS/frontend.log" 2>&1 &
  APP_PID=$!
  set +m
  trap 'shutdown 130' INT
  trap 'shutdown 143' TERM
  trap shutdown EXIT

  await_service 'the API' "$api_wait" "$API_PID" "$LOGS/backend.log" \
    curl -fsS "http://127.0.0.1:$API_PORT/api/health"
  ok "API on http://localhost:$API_PORT/api"
  await_service 'the app' "$app_wait" "$APP_PID" "$LOGS/frontend.log" \
    curl -fsS "http://127.0.0.1:$APP_PORT/"
  ok "app on http://localhost:$APP_PORT"

  local profiles
  profiles=$(curl -fsS "http://127.0.0.1:$API_PORT/api/health" | grep -oE '"profiles":[0-9]+' | cut -d: -f2)

  printf '\n%sEverything is up.%s\n\n' "$BOLD" "$OFF"
  printf '    app            http://localhost:%s\n' "$APP_PORT"
  printf '    API docs       http://localhost:%s/api/docs\n' "$API_PORT"
  printf '    health         http://localhost:%s/api/health\n\n' "$API_PORT"

  if [[ ${profiles:-0} -eq 0 ]]; then
    printf '    The corpus is empty. Open the app, go to %sImport%s, sign in with\n' "$BOLD" "$OFF"
    printf '    %sadmin / admin%s, and upload the export. Nothing is written until you approve it.\n\n' "$BOLD" "$OFF"
  else
    printf '    %s profiles are already loaded.\n\n' "$profiles"
  fi

  printf '    %sLogs: %s/backend.log and %s/frontend.log. Ctrl+C stops both.%s\n\n' "$DIM" "$LOGS" "$LOGS" "$OFF"

  wait
}

# --- subcommands -----------------------------------------------------------

stop_everything() {
  step 'Stopping'

  if stop_listener "$API_PORT"; then ok 'API stopped'; else info 'the API was not running'; fi
  if stop_listener "$APP_PORT"; then ok 'app stopped'; else info 'the app was not running'; fi

  if compose ps --quiet 2>/dev/null | grep -q .; then
    compose down >/dev/null 2>&1 && ok 'Elasticsearch stopped'
  else
    info 'Elasticsearch was not running'
  fi

  choose_pgdata >/dev/null 2>&1 || true
  if [[ -d $PGDATA ]] && listening "$PGPORT"; then
    "$(find_pg_bin pg_ctl)" -D "$PGDATA" stop >/dev/null 2>&1 && ok 'PostgreSQL stopped'
  else
    info 'PostgreSQL was not running'
  fi
}

reset_everything() {
  stop_everything
  step 'Deleting the data'
  compose down --volumes >/dev/null 2>&1 && ok 'search index deleted'
  rm -rf "$PGDATA" && ok "database deleted ($PGDATA)"
  info "'./run.sh' builds both again from scratch."
}

main() {
  mkdir -p "$LOGS"

  if [[ ${1:-} == --yes || ${1:-} == -y ]]; then
    ASSUME_YES=true
    shift
  fi

  case "${1:-start}" in
    start)
      check_prerequisites
      start_postgres
      start_elasticsearch
      install_dependencies frontend
      prepare_backend
      serve
      ;;
    stop)  stop_everything ;;
    reset) reset_everything ;;
    *)     die "unknown command \"$1\". Use: ./run.sh [--yes] [start|stop|reset]" ;;
  esac
}

# On one line on purpose: bash reads a script lazily, so editing this file while it runs would
# otherwise leave it reading from a stale offset. Parsing the exit with the call means it never
# returns to the file at all.
main "$@"; exit $?
