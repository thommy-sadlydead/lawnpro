import { type NextRequest, NextResponse } from 'next/server'

// Middleware is minimal — auth can be added later
// This is a placeholder ready for Supabase auth integration
export async function middleware(request: NextRequest) {
  return NextResponse.next({
    request,
  })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
