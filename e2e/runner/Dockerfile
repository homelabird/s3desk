FROM harbor.k8s.homelabird.com/library/python:3.12-slim

RUN groupadd -r s3desk \
    && useradd -r -g s3desk -d /home/s3desk -s /usr/sbin/nologin s3desk \
    && mkdir -p /home/s3desk /app \
    && chown -R s3desk:s3desk /home/s3desk /app

WORKDIR /app

COPY --chown=s3desk:s3desk runner.py /app/runner.py

USER s3desk

CMD ["python", "/app/runner.py"]
