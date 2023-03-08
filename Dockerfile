FROM node:alpine

WORKDIR /app

COPY package.json package-lock.json  ./

RUN npm install

COPY . .

CMD ["node", "app.js"]

EXPOSE 8601
