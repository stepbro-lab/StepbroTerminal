#!/bin/bash
# After the .deb is unpacked. electron-builder's own script, plus what Ubuntu 23.10 and later need
# for Chromium's sandbox. Its dollar-brace macros (the program's name, the install folder's) are
# filled in when the package is built; the shell's own variables are written without braces so
# that they are left alone.

# The command on the PATH.
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

# Chromium runs its processes inside unprivileged user namespaces. Ubuntu 23.10 and later
# (kernel.apparmor_restrict_unprivileged_userns=1) let only programs whose AppArmor profile says
# so use them fully, and without one the app aborted at launch. This is the profile Ubuntu ships
# for browsers that need the same. It takes AppArmor 4, which those releases have; elsewhere there
# is nothing to do.
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

# chrome-sandbox is Chromium's other way in: a helper run as root, for when namespaces cannot be
# had. electron-builder chose with "unshare --user true", which still succeeds on Ubuntu 23.10 and
# later while Chromium's own use of the namespace is refused there; so a restricted system whose
# profile could not be loaded gets the helper too. The install folder has no space in it any more,
# which the helper needs to start the app's processes.
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
