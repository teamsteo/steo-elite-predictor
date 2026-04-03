'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Download,
  FileText,
  FileSpreadsheet,
  Calendar,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface ExportManagerProps {
  predictions?: any[];
  bankrollData?: any;
  stats?: any;
}

type ExportFormat = 'pdf' | 'excel' | 'csv';
type ExportType = 'predictions' | 'bankroll' | 'full';

export function ExportManager({ predictions, bankrollData, stats }: ExportManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [exportType, setExportType] = useState<ExportType>('predictions');
  const [dateRange, setDateRange] = useState<'all' | '7d' | '30d' | '90d'>('30d');
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportStatus('idle');

    try {
      // Fetch data based on export type
      let dataToExport: any = {};

      if (exportType === 'predictions' || exportType === 'full') {
        const res = await fetch(`/api/history?type=predictions&range=${dateRange}`);
        const predData = await res.json();
        dataToExport.predictions = predData.predictions || predData || [];
      }

      if (exportType === 'bankroll' || exportType === 'full') {
        const res = await fetch('/api/bankroll?userId=default-user');
        const bankData = await res.json();
        dataToExport.bankroll = bankData;
      }

      if (exportType === 'full') {
        dataToExport.stats = stats || {};
      }

      // Generate export based on format
      if (exportFormat === 'pdf') {
        await generatePDF(dataToExport, exportType, dateRange);
      } else if (exportFormat === 'excel') {
        await generateExcel(dataToExport, exportType, dateRange);
      } else {
        await generateCSV(dataToExport, exportType, dateRange);
      }

      setExportStatus('success');
      setTimeout(() => {
        setDialogOpen(false);
        setExportStatus('idle');
      }, 1500);
    } catch (error) {
      console.error('Export error:', error);
      setExportStatus('error');
    } finally {
      setExporting(false);
    }
  }, [exportFormat, exportType, dateRange, stats]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          Exporter les Données
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {/* Quick Export Buttons */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExportFormat('pdf');
              setExportType('predictions');
              setDialogOpen(true);
            }}
            className="gap-1"
          >
            <FileText className="h-3 w-3" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExportFormat('excel');
              setExportType('predictions');
              setDialogOpen(true);
            }}
            className="gap-1"
          >
            <FileSpreadsheet className="h-3 w-3" />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExportFormat('csv');
              setExportType('full');
              setDialogOpen(true);
            }}
            className="gap-1"
          >
            <Download className="h-3 w-3" />
            CSV
          </Button>
        </div>

        {/* Export Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                Exporter vos données
              </DialogTitle>
              <DialogDescription>
                Choisissez le format et la période à exporter
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Export Type */}
              <div className="space-y-2">
                <Label>Type d'export</Label>
                <Select value={exportType} onValueChange={(v) => setExportType(v as ExportType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="predictions">
                      <div className="flex items-center gap-2">
                        📊 Prédictions uniquement
                      </div>
                    </SelectItem>
                    <SelectItem value="bankroll">
                      <div className="flex items-center gap-2">
                        💰 Bankroll uniquement
                      </div>
                    </SelectItem>
                    <SelectItem value="full">
                      <div className="flex items-center gap-2">
                        📋 Rapport complet
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Format */}
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-red-500" />
                        PDF - Rapport formaté
                      </div>
                    </SelectItem>
                    <SelectItem value="excel">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-green-500" />
                        Excel - Tableur
                      </div>
                    </SelectItem>
                    <SelectItem value="csv">
                      <div className="flex items-center gap-2">
                        <Download className="h-4 w-4 text-blue-500" />
                        CSV - Données brutes
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Période
                </Label>
                <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">7 derniers jours</SelectItem>
                    <SelectItem value="30d">30 derniers jours</SelectItem>
                    <SelectItem value="90d">90 derniers jours</SelectItem>
                    <SelectItem value="all">Tout l'historique</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Preview */}
              <div className="p-3 rounded-lg bg-muted/50 text-xs">
                <div className="font-medium mb-1">Aperçu de l'export :</div>
                <ul className="text-muted-foreground space-y-0.5">
                  {exportType === 'predictions' && (
                    <>
                      <li>• Liste des prédictions</li>
                      <li>• Résultats et accuracy</li>
                      <li>• Cotes et profits</li>
                    </>
                  )}
                  {exportType === 'bankroll' && (
                    <>
                      <li>• Historique des transactions</li>
                      <li>• Évolution de la bankroll</li>
                      <li>• Stats ROI/profit</li>
                    </>
                  )}
                  {exportType === 'full' && (
                    <>
                      <li>• Prédictions complètes</li>
                      <li>• Historique bankroll</li>
                      <li>• Statistiques globales</li>
                      <li>• Graphiques (PDF uniquement)</li>
                    </>
                  )}
                </ul>
              </div>
            </div>

            <DialogFooter>
              {exportStatus === 'success' ? (
                <div className="flex items-center gap-2 text-green-500">
                  <CheckCircle className="h-4 w-4" />
                  Export téléchargé !
                </div>
              ) : exportStatus === 'error' ? (
                <div className="flex items-center gap-2 text-red-500">
                  <AlertCircle className="h-4 w-4" />
                  Erreur lors de l'export
                </div>
              ) : (
                <Button onClick={handleExport} disabled={exporting}>
                  {exporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Export en cours...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Télécharger {exportFormat.toUpperCase()}
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// Generate PDF (client-side using print-friendly HTML)
async function generatePDF(data: any, type: ExportType, range: string) {
  const date = new Date().toLocaleDateString('fr-FR');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Steo Élite - Rapport ${date}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
        h1 { color: #f97316; border-bottom: 2px solid #f97316; padding-bottom: 10px; }
        h2 { color: #1a1a1a; margin-top: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f97316; color: white; }
        tr:nth-child(even) { background: #f9f9f9; }
        .success { color: #22c55e; }
        .failure { color: #ef4444; }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 15px 0; }
        .stat-box { background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; color: #f97316; }
        .stat-label { font-size: 12px; color: #666; }
        .footer { margin-top: 30px; text-align: center; color: #888; font-size: 11px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>👑 Steo Élite - Rapport de Performance</h1>
      <p>Généré le ${date}</p>

      ${type === 'predictions' || type === 'full' ? generatePredictionsSection(data.predictions || []) : ''}
      ${type === 'bankroll' || type === 'full' ? generateBankrollSection(data.bankroll || {}) : ''}
      ${type === 'full' ? generateStatsSection(data.stats || {}) : ''}

      <div class="footer">
        <p>Steo Élite Predictor © ${new Date().getFullYear()}</p>
        <p>Ce rapport est généré automatiquement et contient des données à titre informatif.</p>
      </div>
    </body>
    </html>
  `;

  // Open print dialog for PDF generation
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }
}

function generatePredictionsSection(predictions: any[]): string {
  if (predictions.length === 0) {
    return '<p>Aucune prédiction sur la période sélectionnée.</p>';
  }

  const rows = predictions.slice(0, 50).map((p: any) => `
    <tr>
      <td>${p.homeTeam || '-'} vs ${p.awayTeam || '-'}</td>
      <td>${p.sport || '-'}</td>
      <td>${p.prediction?.bet || '-'}</td>
      <td>${p.prediction?.confidence || '-'}</td>
      <td class="${p.result?.isCorrect ? 'success' : 'failure'}">
        ${p.result?.isCorrect ? '✓ Gagné' : p.result ? '✗ Perdu' : 'En cours'}
      </td>
    </tr>
  `).join('');

  return `
    <h2>📊 Prédictions</h2>
    <table>
      <thead>
        <tr>
          <th>Match</th>
          <th>Sport</th>
          <th>Pronostic</th>
          <th>Confiance</th>
          <th>Résultat</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function generateBankrollSection(bankroll: any): string {
  const stats = bankroll.stats || {};
  const transactions = bankroll.transactions || [];

  return `
    <h2>💰 Bankroll</h2>
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-value">${stats.balance || bankroll.balance || 0}€</div>
        <div class="stat-label">Solde actuel</div>
      </div>
      <div class="stat-box">
        <div class="stat-value ${stats.roi >= 0 ? 'success' : 'failure'}">
          ${stats.roi >= 0 ? '+' : ''}${(stats.roi || 0).toFixed(1)}%
        </div>
        <div class="stat-label">ROI</div>
      </div>
      <div class="stat-box">
        <div class="stat-value ${stats.profit >= 0 ? 'success' : 'failure'}">
          ${stats.profit >= 0 ? '+' : ''}${(stats.profit || 0).toFixed(0)}€
        </div>
        <div class="stat-label">Profit net</div>
      </div>
    </div>

    ${transactions.length > 0 ? `
      <h3>Transactions récentes</h3>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Montant</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.slice(0, 20).map((tx: any) => `
            <tr>
              <td>${new Date(tx.createdAt).toLocaleDateString('fr-FR')}</td>
              <td>${tx.type}</td>
              <td class="${tx.type === 'deposit' || tx.type === 'winning' ? 'success' : 'failure'}">
                ${tx.type === 'deposit' || tx.type === 'winning' ? '+' : '-'}${tx.amount}€
              </td>
              <td>${tx.description || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}
  `;
}

function generateStatsSection(stats: any): string {
  return `
    <h2>📈 Statistiques Globales</h2>
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-value">${stats.totalPredictions || '-'}</div>
        <div class="stat-label">Prédictions</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${stats.accuracy || '-'}%</div>
        <div class="stat-label">Taux de réussite</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${stats.valueBets || '-'}</div>
        <div class="stat-label">Value Bets</div>
      </div>
    </div>
  `;
}

// Generate Excel (CSV format that opens in Excel)
async function generateExcel(data: any, type: ExportType, range: string) {
  let csvContent = '';

  if (type === 'predictions' || type === 'full') {
    csvContent += 'PRÉDICTIONS\n';
    csvContent += 'Date;Match;Sport;Ligue;Pronostic;Confiance;Cote;Résultat;Profit\n';

    const predictions = data.predictions || [];
    predictions.forEach((p: any) => {
      csvContent += `${p.generatedAt || ''};`;
      csvContent += `${p.homeTeam || ''} vs ${p.awayTeam || ''};`;
      csvContent += `${p.sport || ''};`;
      csvContent += `${p.league || ''};`;
      csvContent += `${p.prediction?.bet || ''};`;
      csvContent += `${p.prediction?.confidence || ''};`;
      csvContent += `${p.odds?.home || p.odds?.away || ''};`;
      csvContent += `${p.result?.isCorrect ? 'Gagné' : p.result ? 'Perdu' : 'En cours'};`;
      csvContent += `${p.result?.profit || 0}\n`;
    });
    csvContent += '\n';
  }

  if (type === 'bankroll' || type === 'full') {
    csvContent += 'BANKROLL\n';
    csvContent += 'Date;Type;Montant;Description\n';

    const transactions = data.bankroll?.transactions || [];
    transactions.forEach((tx: any) => {
      csvContent += `${tx.createdAt};`;
      csvContent += `${tx.type};`;
      csvContent += `${tx.amount};`;
      csvContent += `${tx.description || ''}\n`;
    });
    csvContent += '\n';

    csvContent += 'STATISTIQUES\n';
    csvContent += 'Métrique;Valeur\n';
    const stats = data.bankroll?.stats || {};
    csvContent += `Solde;${data.bankroll?.balance || 0}\n`;
    csvContent += `ROI;${stats.roi || 0}%\n`;
    csvContent += `Profit;${stats.profit || 0}€\n`;
    csvContent += `Dépôts;${stats.totalDeposits || 0}€\n`;
    csvContent += `Gains;${stats.totalWinnings || 0}€\n`;
  }

  // Download as Excel-compatible CSV
  downloadFile(csvContent, `steo-elite-export-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
}

// Generate CSV
async function generateCSV(data: any, type: ExportType, range: string) {
  // Same as Excel but simpler formatting
  await generateExcel(data, type, range);
}

// Helper to download file
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob(['\ufeff' + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default ExportManager;
