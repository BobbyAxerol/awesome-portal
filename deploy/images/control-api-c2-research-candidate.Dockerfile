# RESEARCH CANDIDATE ONLY. Supply an explicitly reviewed sha256-pinned control
# API Alpine 3.24 image as C2_BASE_IMAGE; this file does not deploy or enable C2.
# Package bytes are pinned as well as the versions: if upstream rotates or
# removes any artifact the build fails rather than silently changing inputs.
ARG C2_BASE_IMAGE
FROM ${C2_BASE_IMAGE}
ARG C2_BASE_IMAGE

USER root
RUN set -eux; \
    case "$C2_BASE_IMAGE" in *@sha256:*) ;; *) exit 1 ;; esac; \
    base_digest="${C2_BASE_IMAGE##*@sha256:}"; \
    test "${#base_digest}" -eq 64; \
    case "$base_digest" in *[!0-9a-f]*) exit 1 ;; esac; \
    mkdir /tmp/c2-research-apks; \
    apk --no-cache --repositories-file /dev/null --repository https://dl-cdn.alpinelinux.org/alpine/v3.24/main fetch --output /tmp/c2-research-apks openssl libcrypto3 libssl3; \
    printf '%s\n' \
      '9358e8f38eb19a1e035355626570c76bda1e5a49084c768fb0edc1e607251e99  /tmp/c2-research-apks/openssl-3.5.9-r0.apk' \
      '6632d758d8f5e9ea3b650fe966f23bbf9a202f8b8dceecac93da135dec5e3689  /tmp/c2-research-apks/libcrypto3-3.5.9-r0.apk' \
      '05e3393fb95aa5751ca2f9d242f659f6cff82c1cc7767cc2df4a086f7ad01877  /tmp/c2-research-apks/libssl3-3.5.9-r0.apk' | sha256sum -c -; \
    apk verify /tmp/c2-research-apks/openssl-3.5.9-r0.apk /tmp/c2-research-apks/libcrypto3-3.5.9-r0.apk /tmp/c2-research-apks/libssl3-3.5.9-r0.apk; \
    apk add --no-network --no-cache /tmp/c2-research-apks/openssl-3.5.9-r0.apk /tmp/c2-research-apks/libcrypto3-3.5.9-r0.apk /tmp/c2-research-apks/libssl3-3.5.9-r0.apk; \
    /usr/bin/openssl version; \
    rm /tmp/c2-research-apks/openssl-3.5.9-r0.apk /tmp/c2-research-apks/libcrypto3-3.5.9-r0.apk /tmp/c2-research-apks/libssl3-3.5.9-r0.apk; \
    rmdir /tmp/c2-research-apks
USER node
