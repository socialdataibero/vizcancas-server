# Usa Node
FROM node:18

# Carpeta de trabajo
WORKDIR /app

# Copia dependencias
COPY package*.json ./

# Instala deps
RUN npm install

# Copia código
COPY . .

# Compila NestJS
RUN npm run build

# Cloud Run usa 8080
ENV PORT=8080

# Expone puerto
EXPOSE 8080

# Ejecuta app
CMD ["node", "dist/main"]