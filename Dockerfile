FROM node:12-alpine
WORKDIR /src/app

COPY *.js ./
COPY config/* ./config/
COPY package*.json ./

RUN apk add --update --no-cache bash
RUN npm install

EXPOSE 9131

CMD [ "node", "index.js" ]
