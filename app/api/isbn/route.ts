import {
  accessErrorResponse,
  requireApprovedCollaborator,
} from "../../authz";

export async function GET(request: Request) {
  try {
    await requireApprovedCollaborator(request);
    const isbn = new URL(request.url).searchParams.get("isbn")?.replace(/[^0-9X]/gi, "") ?? "";
    if (isbn.length !== 10 && isbn.length !== 13) {
      return Response.json({ error: "Ingresa un ISBN de 10 o 13 caracteres." }, { status: 400 });
    }
    const response = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&jscmd=data&format=json`,
      { headers: { "User-Agent": "Biblioteca216/1.0" } },
    );
    if (!response.ok) throw new Error("No se pudo consultar el catálogo externo.");
    const payload = (await response.json()) as Record<string, {
      title?: string;
      authors?: Array<{ name: string }>;
      publishers?: Array<{ name: string }>;
      publish_date?: string;
      cover?: { medium?: string; large?: string; small?: string };
    }>;
    const book = payload[`ISBN:${isbn}`];
    if (!book) {
      return Response.json({ error: "No encontramos ese ISBN. Puedes completar los datos manualmente." }, { status: 404 });
    }
    return Response.json({
      isbn,
      title: book.title ?? "",
      author: book.authors?.map((item) => item.name).join(", ") ?? "",
      publisher: book.publishers?.map((item) => item.name).join(", ") ?? "",
      publishYear: book.publish_date ?? "",
      coverUrl: book.cover?.large ?? book.cover?.medium ?? book.cover?.small ?? "",
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return Response.json(
      { error: error instanceof Error ? error.message : "Error de consulta." },
      { status: 502 },
    );
  }
}
