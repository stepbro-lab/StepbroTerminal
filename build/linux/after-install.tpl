#!/bin/bash

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    # Up to 0.1.0-beta.27 the app lived in "/opt/stepbro terminal", a space that broke the sandbox.
    update-alternatives --remove '${executable}' '/opt/stepbro terminal/${executable}' >/dev/null 2>&1 || true
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Ubuntu 23.10+ only lets programs with an AppArmor profile use unprivileged user namespaces.
apparmor_profile=/etc/apparmor.d/stepbro-terminal
profile_loaded=0
if [ -f /etc/apparmor.d/abi/4.0 ] && hash apparmor_parser 2>/dev/null; then
    cat > "$apparmor_profile" <<'PROFILE'
# Lets stepbro terminal create the user namespaces Chromium's sandbox runs in.
# Written by the stepbro terminal package, and removed with it.
abi <abi/4.0>,
include <tunables/global>

profile stepbro-terminal "/opt/${sanitizedProductName}/${executable}" flags=(unconfined) {
  userns,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/stepbro-terminal>
}
PROFILE
    # Loaded now where AppArmor is running; otherwise it is read at the next boot.
    if apparmor_parser --replace --write-cache --skip-read-cache "$apparmor_profile" >/dev/null 2>&1; then
        profile_loaded=1
    fi
fi

# The setuid helper is the fallback on restricted systems whose profile could not be loaded.
restricted=`cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0`
if [ "$profile_loaded" = 1 ]; then
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
elif [ "$restricted" = 1 ] || ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    chown root:root '/opt/${sanitizedProductName}/chrome-sandbox' || true
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
