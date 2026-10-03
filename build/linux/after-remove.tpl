#!/bin/bash
# After the .deb is removed, and between the old and the new one on an upgrade ($1 is remove,
# purge or upgrade). Its dollar-brace macros are filled in when the package is built.

# The command on the PATH; the new package's script puts it back after an upgrade.
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}' >/dev/null 2>&1 || true
else
    rm -f '/usr/bin/${executable}'
fi

# The AppArmor profile the install wrote goes with the app, but not between two versions of it.
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
