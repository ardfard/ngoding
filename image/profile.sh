# Login shell setup for the sandbox user.

# No network inside the VM: make uv resolve only from the local wheelhouse
# and the system Python.
export UV_OFFLINE=1
export UV_NO_INDEX=1
export UV_FIND_LINKS=/opt/wheels
export UV_PYTHON_DOWNLOADS=never
export UV_PYTHON_PREFERENCE=only-system
export UV_LINK_MODE=copy
export PIP_NO_INDEX=1
export PIP_FIND_LINKS=/opt/wheels

export EDITOR=nvim
export VISUAL=nvim
alias ll='ls -alF'
alias vi=nvim
alias vim=nvim

if [ "$(id -u)" = 1000 ] && [ -z "$NGODING_GREETED" ]; then
    export NGODING_GREETED=1
    cat <<'EOF'
Welcome to the ngoding sandbox.
  Challenge files: ~/challenge/<problem>/
  Write answers:   ~/output/
  Tools: python3, gcc, g++, go, rustc, ghc/runghc, uv, pip, git, nano, nvim
  Offline packages in /opt/wheels (try: uv init demo && cd demo && uv add rich)

EOF
fi

