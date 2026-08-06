FROM harbor.k8s.homelabird.com/library/python:3.12-slim@sha256:646fb0bca3dd3ea1bcc6feb72c17ed16eed6e10cffc732fcc1478bd3e7f02d7b

RUN groupadd -r s3desk \
    && useradd -r -g s3desk -d /home/s3desk -s /usr/sbin/nologin s3desk \
    && mkdir -p /home/s3desk /app \
    && chown -R s3desk:s3desk /home/s3desk /app

WORKDIR /app

COPY --chown=s3desk:s3desk runner.py /app/runner.py

USER s3desk

CMD ["python", "/app/runner.py"]
