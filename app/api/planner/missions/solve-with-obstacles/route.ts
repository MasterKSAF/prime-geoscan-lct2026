import { solveRequest } from '../solve/route';
export async function POST(request: Request) {
  return solveRequest(request, true);
}
