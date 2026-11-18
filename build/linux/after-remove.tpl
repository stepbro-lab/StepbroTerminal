#!/bin/bash

if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}' >/dev/null 2>&1 || true
else
    rm -f '/usr/bin/${executable}'
fi

case "$1" in
    remove|purge)
        if [ -f /etc/apparmor.d/stepbro-terminal ]; then
            if hash apparmor_parser 2>/dev/null; then
                apparmor_parser --remove /etc/apparmor.d/stepbro-terminal >/dev/null 2>&1 || true
            fi
            rm -f /etc/apparmor.d/stepbro-terminal
        fi
        ;;
esac
