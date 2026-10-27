#!/bin/sh
# Wrapper around the real uv (/opt/uv/uv).
#
# Under CheerpX, uv cannot unpack wheels it builds itself, so a project that is
# installed as a package fails with "The wheel is invalid: Missing .dist-info
# directory". Default `uv init` to a non-packaged (virtual) project unless the
# student explicitly asks for a layout.
if [ "$1" = init ]; then
    case " $* " in
        *" --package "*|*" --no-package "*|*" --lib "*|*" --bare "*|*" --script "*) ;;
        *) shift; exec /opt/uv/uv init --no-package "$@" ;;
    esac
fi
exec /opt/uv/uv "$@"
