// Authentication API Route
import { NextRequest, NextResponse } from 'next/server';
import { 
  verifyCredentials, 
  generateSessionToken, 
  registerSession, 
  securityConfig, 
  getSession, 
  clearSessionCookie,
  SESSION_DURATION 
} from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;
    
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }
    
    const result = await verifyCredentials(username, password);
    
    if (!result.valid || !result.user) {
      return NextResponse.json(
        { error: result.error || 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    // Créer le token de session
    const token = generateSessionToken();
    registerSession(token, username);
    
    // Définir le cookie
    const cookieStore = await cookies();
    cookieStore.set(securityConfig.cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: SESSION_DURATION / 1000
    });
    
    return NextResponse.json({
      success: true,
      user: {
        username: result.user.username,
        name: result.user.name,
        role: result.user.role,
        daysRemaining: result.user.daysRemaining,
        expiresAt: result.user.expiresAt
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }
    
    return NextResponse.json({
      authenticated: true,
      user: session.user,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}
