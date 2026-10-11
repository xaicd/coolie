###############################################################################
# agy-ubuntu — sandboxed Ubuntu 24.04 dev container
#
#   * 100% of internal traffic is routed through an embedded Mihomo
#     (Clash Meta) TUN interface (clash0)
#   * Totally isolated from the host network: runs on the DEFAULT bridge,
#     never on --network host
#   * Google Antigravity CLI (agy) pre-installed
#   * Node.js 22 LTS (npm/npx) + pnpm pre-installed for Next.js dev
#
# OFFLINE build: all binaries/packages are pre-downloaded into ./downloads/
# (see the host-side bootstrap in this repo) and COPYed in, so the build makes
# no network requests at all. This sidesteps the host's flaky container egress.
###############################################################################

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# agy (and other user-local tools) install into /root/.local/bin —
# make that directory globally resolvable.
ENV PATH="/root/.local/bin:${PATH}"

#------------------------------------------------------------------------------
# Base dev tools — pre-downloaded .debs with the full dependency closure
# (ca-certificates, curl, git, iproute2, iptables, nano, tzdata, xdg-utils,
#  libatomic1 — a runtime dep of the pnpm standalone binary).
# dpkg two-pass (unpack all, then configure) resolves ordering correctly.
#------------------------------------------------------------------------------
COPY downloads/debs/ /tmp/debs/
RUN dpkg --unpack /tmp/debs/*.deb && \
    dpkg --configure -a && \
    rm -rf /tmp/debs

#------------------------------------------------------------------------------
# Mihomo (Clash Meta) core — v1.19.30, linux-amd64 (pre-downloaded)
#------------------------------------------------------------------------------
RUN mkdir -p /root/.config/mihomo
COPY downloads/mihomo /usr/local/bin/mihomo
RUN chmod +x /usr/local/bin/mihomo

#------------------------------------------------------------------------------
# Google Antigravity CLI — pre-downloaded tarball (contains binary `antigravity`)
#------------------------------------------------------------------------------
COPY downloads/agy.tar.gz /tmp/agy.tar.gz
RUN mkdir -p /root/.local/bin && \
    tar -xzf /tmp/agy.tar.gz -C /tmp/ antigravity && \
    mv /tmp/antigravity /root/.local/bin/agy && \
    chmod +x /root/.local/bin/agy && \
    rm -f /tmp/agy.tar.gz

#------------------------------------------------------------------------------
# Node.js 22 LTS (npm/npx bundled) + pnpm — offline pre-downloaded binaries.
# node.tar.gz unpacks to node-vX.Y.Z-linux-x64/{bin,lib,include,share}; strip
# the top dir into /usr/local so node/npm/npx land on PATH. pnpm is a standalone
# single executable kept beside its bundled dist/ tree.
#------------------------------------------------------------------------------
COPY downloads/node.tar.gz /tmp/node.tar.gz
RUN tar -xzf /tmp/node.tar.gz -C /usr/local --strip-components=1 && \
    rm -f /tmp/node.tar.gz

COPY downloads/pnpm.tar.gz /tmp/pnpm.tar.gz
RUN mkdir -p /usr/local/lib/pnpm && \
    tar -xzf /tmp/pnpm.tar.gz -C /usr/local/lib/pnpm && \
    ln -s /usr/local/lib/pnpm/pnpm /usr/local/bin/pnpm && \
    rm -f /tmp/pnpm.tar.gz

#------------------------------------------------------------------------------
# Entrypoint + default workspace
#------------------------------------------------------------------------------
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /root/workspace

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
