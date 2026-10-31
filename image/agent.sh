#!/bin/bash
# Control channel between the web page and the VM on /dev/ttyS1.
#
# Requests:  <id> <verb> [args...]\n
# Responses: DATA <id> <base64>\n (for read)   then   DONE <id> <status>\n
#
# Runs as root. Only a fixed set of verbs is accepted.
stty -F /dev/ttyS1 raw -echo 115200
exec </dev/ttyS1 >/dev/ttyS1 2>/dev/null

echo READY
while read -r id verb a b; do
    case "$verb" in
        ping) st=0 ;;
        # write <path> <base64>: create a file owned by the student
        write)
            mkdir -p "$(dirname "$a")" && printf %s "$b" | base64 -d > "$a" \
                && chown user:user "$a" "$(dirname "$a")"
            st=$? ;;
        # read <path>: return the file's contents
        read)
            if [ -f "$a" ]; then echo "DATA $id $(base64 -w0 "$a")"; st=0; else st=1; fi ;;
        ls)
            if [ -d "$a" ]; then
                out=$(find "$a" -mindepth 1 -maxdepth 1 \( -type d -printf 'd\t%f\n' -o -type f -printf 'f\t%f\n' -o -printf 'f\t%f\n' \) | sort)
                echo "DATA $id $(printf %s "$out" | base64 -w0)"
                st=0
            else
                st=1
            fi ;;
        mkdir)
            mkdir -p "$a" && chown user:user "$a"
            st=$? ;;
        rm)
            rm -rf -- "$a"
            st=$? ;;
        mv)
            mv -- "$a" "$b" && chown -R user:user "$b" 2>/dev/null
            st=$? ;;
        # resize <rows> <cols>: match the student's tty to the browser terminal
        resize) stty -F /dev/ttyS0 rows "$a" cols "$b"; st=$? ;;
        # init <epoch> <base64 entropy>: after restoring a snapshot, fix the
        # clock and make sure each session gets different randomness
        init)
            date -s "@$a" > /dev/null && printf %s "$b" | base64 -d > /dev/urandom
            st=$? ;;
        *) st=127 ;;
    esac
    echo "DONE $id $st"
done
