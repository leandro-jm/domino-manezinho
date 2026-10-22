export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    /** Código estável para o cliente decidir o que fazer (a mensagem é só pra gente ler). */
    readonly code?: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const unauthorized = (msg = 'Tem que se identificar primeiro, mané.', code?: string) => new HttpError(401, msg, code);
export const forbidden = (msg: string) => new HttpError(403, msg);
export const notFound = (msg: string) => new HttpError(404, msg);
