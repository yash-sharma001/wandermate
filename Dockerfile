# One Dockerfile for every Node service: docker build --build-arg SERVICE=auth .
FROM node:20-alpine
ARG SERVICE
WORKDIR /app

# Install only this service + the shared package (cached until package.json files change)
COPY package.json ./
COPY packages/common/package.json packages/common/
COPY services/${SERVICE}/package.json services/${SERVICE}/
RUN npm install --omit=dev -w services/${SERVICE} -w packages/common

COPY packages/common packages/common
COPY services/${SERVICE} services/${SERVICE}

ENV NODE_ENV=production
WORKDIR /app/services/${SERVICE}
CMD ["npm", "start"]
