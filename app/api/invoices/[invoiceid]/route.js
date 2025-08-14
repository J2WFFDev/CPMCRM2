import {fetchInvoiceDetail} from '../route';

export async function GET(_req, {params}) {
  const {invoiceid} = params;
  const detail = await fetchInvoiceDetail(invoiceid);
  if (!detail) return new Response(JSON.stringify({error: 'Not found'}), {status: 404});
  return new Response(JSON.stringify(detail), {status: 200});
}
