// News Alerts API - Manage and trigger alerts
import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

interface Alert {
  id: string;
  type: 'news' | 'event' | 'price' | 'correlation';
  currency: string;
  condition: string;
  threshold?: number;
  active: boolean;
  triggered: boolean;
  createdAt: string;
  lastTriggered?: string;
}

// In-memory storage for alerts (in production, use a database)
let alerts: Alert[] = [];
let triggeredAlerts: Array<{ alert: Alert; data: unknown; triggeredAt: string }> = [];

// Get current economic events and check for alerts
async function checkAlerts(): Promise<Array<{ alert: Alert; data: unknown }>> {
  const triggered: Array<{ alert: Alert; data: unknown }> = [];
  
  try {
    const zai = await ZAI.create();
    
    for (const alert of alerts.filter(a => a.active && !a.triggered)) {
      if (alert.type === 'news' || alert.type === 'event') {
        // Search for relevant news
        const searchResult = await zai.functions.invoke("web_search", {
          query: `${alert.currency} forex ${alert.condition} today`,
          num: 5
        });
        
        if (Array.isArray(searchResult) && searchResult.length > 0) {
          const relevantItem = searchResult.find((item: { snippet?: string; name?: string }) => {
            const text = ((item.snippet || '') + (item.name || '')).toLowerCase();
            return text.includes(alert.currency.toLowerCase()) && 
                   text.includes(alert.condition.toLowerCase());
          });
          
          if (relevantItem) {
            triggered.push({
              alert,
              data: {
                title: relevantItem.name,
                summary: relevantItem.snippet,
                url: relevantItem.url,
                source: relevantItem.host_name
              }
            });
            alert.triggered = true;
            alert.lastTriggered = new Date().toISOString();
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking alerts:', error);
  }
  
  return triggered;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'list';
  const alertId = searchParams.get('id');
  
  try {
    if (action === 'check') {
      // Check all alerts and return triggered ones
      const triggered = await checkAlerts();
      triggeredAlerts.push(...triggered.map(t => ({
        ...t,
        triggeredAt: new Date().toISOString()
      })));
      
      return NextResponse.json({
        triggered: triggered,
        totalActiveAlerts: alerts.filter(a => a.active).length,
        totalTriggeredToday: triggeredAlerts.length
      });
    }
    
    if (action === 'triggered') {
      // Get all triggered alerts
      return NextResponse.json({
        triggeredAlerts: triggeredAlerts.slice(-20),
        total: triggeredAlerts.length
      });
    }
    
    if (alertId) {
      // Get specific alert
      const alert = alerts.find(a => a.id === alertId);
      if (!alert) {
        return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
      }
      return NextResponse.json({ alert });
    }
    
    // List all alerts
    return NextResponse.json({
      alerts: alerts,
      total: alerts.length,
      active: alerts.filter(a => a.active).length,
      triggered: alerts.filter(a => a.triggered).length
    });
  } catch (error) {
    console.error('Alerts API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, currency, condition, threshold } = body;
    
    if (!type || !currency || !condition) {
      return NextResponse.json(
        { error: 'Missing required fields: type, currency, condition' },
        { status: 400 }
      );
    }
    
    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      currency: currency.toUpperCase(),
      condition,
      threshold,
      active: true,
      triggered: false,
      createdAt: new Date().toISOString()
    };
    
    alerts.push(alert);
    
    return NextResponse.json({
      success: true,
      alert,
      message: `Alerte créée pour ${currency} - ${condition}`
    });
  } catch (error) {
    console.error('Create alert error:', error);
    return NextResponse.json(
      { error: 'Failed to create alert' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const alertId = searchParams.get('id');
  
  if (!alertId) {
    return NextResponse.json({ error: 'Alert ID required' }, { status: 400 });
  }
  
  try {
    const body = await request.json();
    const alertIndex = alerts.findIndex(a => a.id === alertId);
    
    if (alertIndex === -1) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }
    
    alerts[alertIndex] = {
      ...alerts[alertIndex],
      ...body,
      id: alertId // Preserve ID
    };
    
    return NextResponse.json({
      success: true,
      alert: alerts[alertIndex]
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update alert' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const alertId = searchParams.get('id');
  
  if (!alertId) {
    return NextResponse.json({ error: 'Alert ID required' }, { status: 400 });
  }
  
  const initialLength = alerts.length;
  alerts = alerts.filter(a => a.id !== alertId);
  
  if (alerts.length === initialLength) {
    return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
  }
  
  return NextResponse.json({
    success: true,
    message: 'Alert deleted'
  });
}
