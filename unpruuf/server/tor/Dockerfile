FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends tor \
    && rm -rf /var/lib/apt/lists/*

COPY torrc /etc/tor/torrc

VOLUME ["/var/lib/tor/unpruuf_relay"]

CMD ["tor", "-f", "/etc/tor/torrc"]
