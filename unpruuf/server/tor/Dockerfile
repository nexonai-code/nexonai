FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends tor procps \
    && rm -rf /var/lib/apt/lists/*

COPY torrc /etc/tor/torrc

VOLUME ["/var/lib/tor/unpruuf_relay"]

# The Debian package creates debian-tor and owns /var/lib/tor; tor needs no root here.
USER debian-tor
HEALTHCHECK --interval=60s --timeout=5s --start-period=60s --retries=3 \
  CMD pgrep -x tor >/dev/null || exit 1

CMD ["tor", "-f", "/etc/tor/torrc"]
