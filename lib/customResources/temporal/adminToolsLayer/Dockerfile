ARG TEMPORAL_ADMIN_TOOLS_IMAGE
FROM --platform=linux/amd64 ${TEMPORAL_ADMIN_TOOLS_IMAGE}

# CDK will make the layer by zipping everything that is under /asset.
# At run time, they will be available under /opt
USER root
RUN  mkdir -p /asset/temporal/bin && \
     cp -a /usr/local/bin/{tctl,temporal-sql-tool,temporal-cassandra-tool} /asset/temporal/bin/ && \
     cp -a /etc/temporal/schema /asset/temporal/schema
