import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import SpreadsheetTable from '@/components/SpreadsheetTable';
import ImportListaPanel from '@/components/ImportListaPanel';
import CarregarListaPanel from '@/components/CarregarListaPanel';
import GerarLinkPanel from '@/components/GerarLinkPanel';
import FornecedoresPanel from '@/components/FornecedoresPanel';
import AnalisePrecosPanel from '@/components/AnalisePrecosPanel';
import Dashboard from '@/components/Dashboard';
import PerfilPanel from '@/components/PerfilPanel';
import { useAvatar } from '@/hooks/useAvatar';
import HeaderAvatarButton from '@/components/HeaderAvatarButton';
import SubscriptionTimerBadge from '@/components/SubscriptionTimerBadge';
import adrLogo from '@/assets/adr-logo.jpeg.asset.json';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import ProfileGate from '@/components/ProfileGate';
import { condicoesFromLink, getPrecoUF, ufsDaResposta, ordenarUFs, ufNome } from '@/lib/estados';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LogOut, Menu, X, Home, Upload, FolderOpen, Link2, CheckSquare, Users, BarChart3, Table, User as UserIcon, Package } from 'lucide-react';

interface Lista {
  id: string;
  nome: string;
  status: string;
  produtos: { codigo_interno: string; descricao: string; codigo_barras: string }[];
  created_at: string;
  prazo?: string | null;
}

interface RespostaEmpresa {
  empresa: string;
  resposta: { codigo_interno: string; preco?: number | string; preco_mt?: number | string; preco_go?: number | string }[];
}

const Index = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);
  const [carregarOpen, setCarregarOpen] = useState(false);
  const [finalizadasOpen, setFinalizadasOpen] = useState(false);
  const [gerarLinkOpen, setGerarLinkOpen] = useState(false);
  const [fornecedoresOpen, setFornecedoresOpen] = useState(false);
  const [perfilOpen, setPerfilOpen] = useState(false);
  const { avatarUrl } = useAvatar();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [currentLista, setCurrentLista] = useState<Lista | null>(null);
  const [respostas, setRespostas] = useState<RespostaEmpresa[]>([]);
  const [isFinalized, setIsFinalized] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [activeTab, setActiveTab] = useState<'planilha' | 'analise'>('planilha');

  // Confirmation dialog for encerrar
  const [showEncerrarDialog, setShowEncerrarDialog] = useState(false);
  const [encerrarStats, setEncerrarStats] = useState<{ total: number; responded: number; pending: string[] }>({ total: 0, responded: 0, pending: [] });

  const [tipoPrecoMap, setTipoPrecoMap] = useState<Record<string, string>>({});

  // Edição do prazo da cotação
  const [prazoDialogOpen, setPrazoDialogOpen] = useState(false);
  const [prazoData, setPrazoData] = useState('');
  const [prazoHora, setPrazoHora] = useState('23:59');
  const [savingPrazo, setSavingPrazo] = useState(false);

  const openPrazoDialog = () => {
    if (!currentLista) return;
    if (currentLista.prazo) {
      const d = new Date(currentLista.prazo);
      const pad = (n: number) => String(n).padStart(2, '0');
      setPrazoData(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setPrazoHora(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else {
      setPrazoData('');
      setPrazoHora('23:59');
    }
    setPrazoDialogOpen(true);
  };

  const savePrazo = async (clear = false) => {
    if (!currentLista) return;
    if (!clear && !prazoData) {
      toast.error('Informe a data do prazo.');
      return;
    }
    setSavingPrazo(true);
    const novoPrazo = clear ? null : new Date(`${prazoData}T${prazoHora || '23:59'}:00`).toISOString();
    const { error } = await supabase
      .from('listas')
      .update({ prazo: novoPrazo })
      .eq('id', currentLista.id)
      .eq('user_id', user?.id ?? '');
    setSavingPrazo(false);
    if (error) {
      toast.error('Erro ao atualizar o prazo.');
      return;
    }
    setCurrentLista({ ...currentLista, prazo: novoPrazo });
    setPrazoDialogOpen(false);
    toast.success(clear ? 'Prazo removido.' : 'Prazo atualizado.');
  };

  const loadRespostas = useCallback(async (listaId: string) => {
    if (!user?.id) {
      setRespostas([]);
      return;
    }
    const { data } = await supabase
      .from('respostas')
      .select('empresa, resposta')
      .eq('user_id', user.id)
      .eq('lista_id', listaId);
    setRespostas((data ?? []).map((d: any) => ({ empresa: d.empresa, resposta: d.resposta as any[] })));

    const { data: links } = await supabase
      .from('links_cotacao')
      .select('empresa, tipo_preco_mt, tipo_preco_go, frete_mt, frete_go, condicoes')
      .eq('user_id', user.id)
      .eq('lista_id', listaId);
    const map: Record<string, string> = {};
    (links ?? []).forEach((l: any) => {
      const cond = condicoesFromLink(l);
      Object.entries(cond).forEach(([uf, c]) => {
        map[`${l.empresa}_${uf}`] = c.tipo;
        map[`${l.empresa}_${uf}_FRETE`] = c.frete;
      });
    });
    setTipoPrecoMap(map);
  }, [user?.id]);


  // 1. REALTIME: Subscribe to new responses when a lista is open
  useEffect(() => {
    if (!currentLista || showDashboard) return;

    const channel = supabase
      .channel(`respostas-${currentLista.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'respostas',
          filter: `lista_id=eq.${currentLista.id}`,
        },
        (payload: any) => {
          const empresa = payload.new?.empresa || 'Fornecedor';
          toast.success(`📩 Nova resposta recebida de "${empresa}"!`, { duration: 6000 });
          loadRespostas(currentLista.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'respostas',
          filter: `lista_id=eq.${currentLista.id}`,
        },
        (payload: any) => {
          const empresa = payload.new?.empresa || 'Fornecedor';
          toast.info(`🔄 Resposta atualizada por "${empresa}"`, { duration: 4000 });
          loadRespostas(currentLista.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentLista?.id, showDashboard, loadRespostas]);

  const handleListaSelected = async (lista: Lista, finalized = false) => {
    setCurrentLista(lista);
    setIsFinalized(finalized);
    setShowDashboard(false);
    setActiveTab('planilha');
    await loadRespostas(lista.id);
  };

  const handleBackToDashboard = () => {
    setCurrentLista(null);
    setRespostas([]);
    setIsFinalized(false);
    setShowDashboard(true);
    setActiveTab('planilha');
  };

  // 4. CONFIRMATION: Load stats before showing dialog
  const handleEncerrarClick = async () => {
    if (!currentLista) return;
    const { data: links } = await supabase
      .from('links_cotacao')
      .select('empresa, respondido')
      .eq('user_id', user?.id ?? '')
      .eq('lista_id', currentLista.id);

    const allLinks = links ?? [];
    const responded = allLinks.filter(l => l.respondido).length;
    const pending = allLinks.filter(l => !l.respondido).map(l => l.empresa);

    setEncerrarStats({ total: allLinks.length, responded, pending });
    setShowEncerrarDialog(true);
  };

  const handleEncerrarConfirm = async () => {
    if (!currentLista) return;
    const { error } = await supabase
      .from('listas')
      .update({ status: 'finalizada' })
      .eq('id', currentLista.id)
      .eq('user_id', user?.id ?? '');

    if (error) {
      toast.error('Erro ao encerrar cotação.');
    } else {
      toast.success(`Cotação "${currentLista.nome}" encerrada.`);
      handleBackToDashboard();
    }
    setShowEncerrarDialog(false);
  };

  const handleExport = async (lista: Lista) => {
    const { data } = await supabase
      .from('respostas')
      .select('empresa, resposta')
      .eq('user_id', user?.id ?? '')
      .eq('lista_id', lista.id);

    const resps: RespostaEmpresa[] = (data ?? []).map((d: any) => ({
      empresa: d.empresa,
      resposta: d.resposta as any[],
    }));

    const parseBR = (v: any): number | null => {
      if (v === null || v === undefined || v === '') return null;
      if (typeof v === 'number') return isFinite(v) ? v : null;
      const s = String(v).trim().replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
      const n = parseFloat(s);
      return isFinite(n) ? n : null;
    };

    // Build price map per UF and identify suppliers that have any price for each UF
    const ufs = ordenarUFs(resps.flatMap(r => ufsDaResposta(r.resposta as any[])));
    const byEmpPorUf: Record<string, Record<string, Record<string, number>>> = {};
    for (const uf of ufs) {
      byEmpPorUf[uf] = {};
      for (const r of resps) {
        byEmpPorUf[uf][r.empresa] = {};
        for (const item of r.resposta as any[]) {
          const v = parseBR(getPrecoUF(item, uf));
          if (v !== null) byEmpPorUf[uf][r.empresa][item.codigo_interno] = v;
        }
      }
    }

    const empresasPorUf: Record<string, string[]> = {};
    ufs.forEach(uf => {
      empresasPorUf[uf] = resps.map(r => r.empresa).filter(e => Object.keys(byEmpPorUf[uf][e]).length > 0);
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'COTARME';
    wb.created = new Date();
    const ws = wb.addWorksheet('Cotação', {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 4 }],
    });

    const fixedCols = ['Código Interno', 'Descrição', 'Código de Barras'];
    const totalEmpresasCols = ufs.reduce((acc, uf) => acc + empresasPorUf[uf].length, 0);
    const totalCols = fixedCols.length + totalEmpresasCols;

    // Row 1: Title
    ws.mergeCells(1, 1, 1, totalCols);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = `Cotação: ${lista.nome}`;
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    ws.getRow(1).height = 26;

    // Row 2: Subtitle
    ws.mergeCells(2, 1, 2, totalCols);
    const subCell = ws.getCell(2, 1);
    const subLabel = ufs.map(uf => `${uf}: ${empresasPorUf[uf].length} fornecedor(es)`).join(' • ');
    subCell.value = `Exportado em ${new Date().toLocaleString('pt-BR')} • ${lista.produtos.length} produtos${subLabel ? ` • ${subLabel}` : ''}`;
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'center' };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    ws.getRow(2).height = 18;

    // Header rows 3-4
    const headerFontWhite = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    const fixedFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF2563EB' } };
    const ufGroupFills = ['FF1D4ED8', 'FF15803D', 'FFB45309', 'FF7C3AED', 'FFBE185D', 'FF0E7490'].map(argb => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } }));
    const ufGroupSubFills = ['FFDBEAFE', 'FFDCFCE7', 'FFFEF3C7', 'FFEDE9FE', 'FFFCE7F3', 'FFCFFAFE'].map(argb => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } }));
    const ufGroupTextColors = ['FF1E3A8A', 'FF14532D', 'FF78350F', 'FF4C1D95', 'FF831843', 'FF164E63'];

    fixedCols.forEach((label, i) => {
      const col = i + 1;
      ws.mergeCells(3, col, 4, col);
      const c = ws.getCell(3, col);
      c.value = label;
      c.font = headerFontWhite;
      c.fill = fixedFill;
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });

    // UF region group headers + supplier columns
    let colCursor = fixedCols.length + 1;
    const ufStartCol: Record<string, number> = {};
    ufs.forEach((uf, ufIdx) => {
      const empresasUf = empresasPorUf[uf];
      if (empresasUf.length === 0) return;
      const startCol = colCursor;
      ufStartCol[uf] = startCol;
      const endCol = startCol + empresasUf.length - 1;
      ws.mergeCells(3, startCol, 3, endCol);
      const g = ws.getCell(3, startCol);
      g.value = `${ufNome(uf).toUpperCase()} (${uf})`;
      g.font = headerFontWhite;
      g.fill = ufGroupFills[ufIdx % ufGroupFills.length];
      g.alignment = { vertical: 'middle', horizontal: 'center' };
      empresasUf.forEach((emp, idx) => {
        const cell = ws.getCell(4, startCol + idx);
        cell.value = emp;
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: ufGroupTextColors[ufIdx % ufGroupTextColors.length] } };
        cell.fill = ufGroupSubFills[ufIdx % ufGroupSubFills.length];
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
      colCursor = endCol + 1;
    });

    ws.getRow(3).height = 22;
    ws.getRow(4).height = 22;

    // Data rows
    lista.produtos.forEach((prod, rIdx) => {
      const rowNum = 5 + rIdx;
      ws.getCell(rowNum, 1).value = prod.codigo_interno;
      ws.getCell(rowNum, 2).value = prod.descricao;
      ws.getCell(rowNum, 3).value = prod.codigo_barras;

      const priceCellsPorUf: Record<string, { col: number; value: number }[]> = {};

      ufs.forEach(uf => {
        const empresasUf = empresasPorUf[uf];
        if (empresasUf.length === 0) return;
        const list: { col: number; value: number }[] = [];
        empresasUf.forEach((emp, idx) => {
          const col = ufStartCol[uf] + idx;
          const v = byEmpPorUf[uf][emp][prod.codigo_interno];
          const cell = ws.getCell(rowNum, col);
          if (v !== undefined) {
            cell.value = v;
            cell.numFmt = '"R$" #,##0.00';
            list.push({ col, value: v });
          }
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        });
        priceCellsPorUf[uf] = list;
      });

      // Zebra
      if (rIdx % 2 === 1) {
        for (let c = 1; c <= totalCols; c++) {
          const cell = ws.getCell(rowNum, c);
          if (!cell.fill || (cell.fill as any).type !== 'pattern') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          }
        }
      }

      // Highlight min price per region (>= 2 prices)
      const highlight = (list: { col: number; value: number }[]) => {
        if (list.length < 2) return;
        const min = Math.min(...list.map(p => p.value));
        list.forEach(p => {
          if (p.value === min) {
            const cell = ws.getCell(rowNum, p.col);
            cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF166534' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
          }
        });
      };
      ufs.forEach(uf => highlight(priceCellsPorUf[uf] || []));
    });

    // Borders
    const lastRow = 4 + lista.produtos.length;
    for (let r = 3; r <= lastRow; r++) {
      for (let c = 1; c <= totalCols; c++) {
        ws.getCell(r, c).border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      }
    }
    // Thicker divider between UF blocks
    const ufsComEmpresas = ufs.filter(uf => empresasPorUf[uf].length > 0);
    for (let i = 0; i < ufsComEmpresas.length - 1; i++) {
      const uf = ufsComEmpresas[i];
      const divCol = ufStartCol[uf] + empresasPorUf[uf].length - 1;
      for (let r = 3; r <= lastRow; r++) {
        const cell = ws.getCell(r, divCol);
        cell.border = { ...cell.border, right: { style: 'medium', color: { argb: 'FF64748B' } } };
      }
    }

    // Column widths
    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 48;
    ws.getColumn(3).width = 18;
    for (let i = 0; i < totalEmpresasCols; i++) {
      ws.getColumn(fixedCols.length + 1 + i).width = 16;
    }

    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: lastRow, column: totalCols },
    };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lista.nome}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Planilha exportada!');
  };

  const handleDownloadResultados = async (lista: Lista, formato: 'ciss' | 'consinco' = 'ciss', empresaFiltro?: string) => {
    const { data } = await supabase
      .from('respostas')
      .select('empresa, resposta')
      .eq('user_id', user?.id ?? '')
      .eq('lista_id', lista.id);

    const resps: RespostaEmpresa[] = (data ?? []).map((d: any) => ({
      empresa: d.empresa,
      resposta: d.resposta as any[],
    }));

    // Código interno por empresa + estado (MT/GO com colunas dedicadas; demais UFs usam fallback genérico)
    const codigoConsincoPorEmpresa: Record<string, string> = {};
    const codigoConsincoPorEmpresaEstado: Record<string, string> = {};
    if (formato === 'consinco') {
      const { data: forns } = await supabase
        .from('fornecedores')
        .select('nome, codigo_interno_consinco, codigo_interno_consinco_mt, codigo_interno_consinco_go, codigo_interno, codigo_estado')
        .eq('user_id', user?.id ?? '');
      (forns ?? []).forEach((f: any) => {
        const key = String(f.nome).trim().toLowerCase();
        const codMt = f.codigo_interno_consinco_mt || '';
        const codGo = f.codigo_interno_consinco_go || '';
        if (codMt) codigoConsincoPorEmpresaEstado[`${key}|MT`] = codMt;
        if (codGo) codigoConsincoPorEmpresaEstado[`${key}|GO`] = codGo;
        const legado = f.codigo_interno_consinco || f.codigo_interno || '';
        if (legado) {
          const est = String(f.codigo_estado || '').toUpperCase();
          if (est && !codigoConsincoPorEmpresaEstado[`${key}|${est}`]) {
            codigoConsincoPorEmpresaEstado[`${key}|${est}`] = legado;
          }
        }
        const generico = codMt || codGo || legado;
        if (generico && !codigoConsincoPorEmpresa[key]) codigoConsincoPorEmpresa[key] = generico;
      });
    }


    const parsePrice = (raw: any): number => {
      if (typeof raw === 'number') return raw;
      if (typeof raw === 'string' && raw !== '') {
        const n = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
        return isNaN(n) ? NaN : n;
      }
      return NaN;
    };

    const ufs = ordenarUFs(resps.flatMap(r => ufsDaResposta(r.resposta as any[])));

    let totalArquivos = 0;

    for (const uf of ufs) {
      const winnersBySupplier: Record<string, { codigo_barras: string; preco: number }[]> = {};

      for (const prod of lista.produtos) {
        let lowestPrice = Infinity;
        let winnerEmpresa: string | null = null;

        for (const resp of resps) {
          const item = resp.resposta.find((i: any) => i.codigo_interno === prod.codigo_interno);
          if (!item) continue;
          const raw = getPrecoUF(item, uf);
          const num = parsePrice(raw);
          if (!isNaN(num) && num > 0 && num < lowestPrice) {
            lowestPrice = num;
            winnerEmpresa = resp.empresa;
          }
        }

        if (winnerEmpresa && lowestPrice !== Infinity) {
          if (!winnersBySupplier[winnerEmpresa]) winnersBySupplier[winnerEmpresa] = [];
          winnersBySupplier[winnerEmpresa].push({ codigo_barras: prod.codigo_barras, preco: lowestPrice });
        }
      }

      const suppliers = Object.keys(winnersBySupplier).filter(
        e => !empresaFiltro || e.trim().toLowerCase() === empresaFiltro.trim().toLowerCase()
      );
      for (const empresa of suppliers) {
        const items = winnersBySupplier[empresa];
        const csvLines = items.map(item => {
          if (formato === 'consinco') {
            const empKey = empresa.trim().toLowerCase();
            const codFornecedor =
              codigoConsincoPorEmpresaEstado[`${empKey}|${uf}`] ??
              codigoConsincoPorEmpresa[empKey] ??
              '';
            const preco = item.preco.toFixed(2);
            // A;B;C;D;E;F;G;H;I;J;K
            return `${codFornecedor};;;${item.codigo_barras};;1;${preco};0;0;0;0`;
          }
          const precoFormatted = item.preco.toFixed(2).replace('.', ',');
          return `${item.codigo_barras};1;${precoFormatted}`;
        });
        const csvContent = csvLines.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${lista.nome}_${uf}_${empresa}_${formato.toUpperCase()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        totalArquivos++;
      }
    }

    if (totalArquivos === 0) {
      toast.error('Nenhum preço ganhador encontrado.');
      return;
    }
    toast.success(`${totalArquivos} arquivo(s) CSV ${formato.toUpperCase()} baixado(s) (separados por estado).`);
  };


  const handleDashboardNavigate = (view: 'importar' | 'carregar' | 'finalizadas') => {
    if (view === 'importar') setImportOpen(true);
    else if (view === 'carregar') setCarregarOpen(true);
    else if (view === 'finalizadas') setFinalizadasOpen(true);
  };

  // Check if deadline passed
  const isExpired = currentLista?.prazo ? new Date(currentLista.prazo) < new Date() : false;

  const navItems: { label: string; icon: any; action: () => void; disabled?: boolean; badge?: number }[] = [
    { label: 'Início', icon: Home, action: handleBackToDashboard },
    { label: 'Importar', icon: Upload, action: () => { setImportOpen(true); setMobileMenuOpen(false); } },
    { label: 'Abertas', icon: FolderOpen, action: () => { setCarregarOpen(true); setMobileMenuOpen(false); } },
    { label: 'Gerar Link', icon: Link2, action: () => { setGerarLinkOpen(true); setMobileMenuOpen(false); }, disabled: !currentLista || isFinalized },
    { label: 'Finalizadas', icon: CheckSquare, action: () => { setFinalizadasOpen(true); setMobileMenuOpen(false); } },
    { label: 'Fornecedores', icon: Users, action: () => { setFornecedoresOpen(true); setMobileMenuOpen(false); } },
    { label: 'Perfil', icon: UserIcon, action: () => { setPerfilOpen(true); setMobileMenuOpen(false); } },
  ];

  return (
    <ProfileGate>
      <div className="flex flex-col h-screen bg-[#F8FAFC]">
        {/* Modern Header */}
        <header className="sticky top-0 z-30 w-full bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={handleBackToDashboard} className="p-1 rounded-xl" title="COTARME">
              <img src={adrLogo.url} alt="COTARME" className="h-9 w-9 rounded-lg object-contain" />
            </button>
            <div>
              <h1 className="text-lg font-display font-bold text-slate-900 tracking-tight cursor-pointer" onClick={handleBackToDashboard}>
                COTARME
              </h1>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Gestão de Cotações</p>
            </div>
          </div>

          {/* Desktop nav - Refined */}
          <div className="hidden md:flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0 overflow-x-auto no-scrollbar">
              {navItems.slice(1).filter(i => i.label !== 'Perfil').map(item => (
                <Button
                  key={item.label}
                  variant={item.label === 'Gerar Link' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={item.action}
                  disabled={item.disabled}
                  className={`relative shrink-0 text-xs font-bold rounded-xl h-9 ${
                    item.label === 'Gerar Link'
                      ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  } ${item.disabled ? 'opacity-30' : ''}`}
                >
                  <item.icon className="w-3.5 h-3.5 mr-2" />
                  {item.label}
                  {!!item.badge && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </Button>
              ))}
            </div>
            <SubscriptionTimerBadge />
            <HeaderAvatarButton onClick={() => setPerfilOpen(true)} />
            <div className="w-px h-5 bg-slate-200 mx-2 shrink-0" />
            <Button variant="ghost" size="icon" onClick={signOut} title="Sair" className="shrink-0 hover:bg-red-50 hover:text-red-600 rounded-full transition-colors w-9 h-9">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>

          {/* Mobile menu toggle */}
          <div className="flex md:hidden items-center gap-2 shrink-0">
            <SubscriptionTimerBadge />
            <HeaderAvatarButton onClick={() => { setPerfilOpen(true); setMobileMenuOpen(false); }} />
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="w-9 h-9 rounded-xl shrink-0">
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>

        </header>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-1 shrink-0 animate-in slide-in-from-top duration-200">
          {navItems.map(item => (
            <button
              key={item.label}
              onClick={() => { item.action(); setMobileMenuOpen(false); }}
              disabled={item.disabled}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-left transition-all ${
                item.disabled
                  ? 'opacity-30 cursor-not-allowed text-slate-400'
                  : 'text-slate-600 hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              {item.label === 'Perfil' && avatarUrl ? (
                <img src={avatarUrl} alt="Foto de perfil" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <item.icon className="w-4 h-4" />
              )}

              {item.label}
              {!!item.badge && (
                <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => { signOut(); setMobileMenuOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-left text-red-600 hover:bg-red-50 active:bg-red-100 mt-2 border-t border-slate-100 pt-3"
          >
            <LogOut className="w-4 h-4" />
            Sair da Conta
          </button>
        </div>
      )}

      {/* Lista info bar with tabs - Refined */}
      {currentLista && !showDashboard && (
        <div className="shrink-0 border-b border-slate-200 bg-white">
          <div className="px-4 sm:px-8 py-3 flex items-center gap-3 flex-wrap">
            <button 
              onClick={handleBackToDashboard} 
              className="text-slate-400 hover:text-primary transition-colors p-1.5 hover:bg-slate-50 rounded-lg"
              title="Voltar ao início"
            >
              <Home className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1" />
            
            <div className="flex flex-col">
              <span className="text-xs font-black text-slate-900 leading-none mb-0.5">{currentLista.nome}</span>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                {currentLista.produtos.length} itens • {respostas.length} respostas
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {isFinalized && (
                <span className="text-[9px] font-black tracking-widest uppercase bg-emerald-50 text-emerald-600 px-2 py-1 rounded-md">
                  FINALIZADA
                </span>
              )}
              {!isFinalized ? (
                <button
                  onClick={openPrazoDialog}
                  title="Editar prazo de expiração"
                  className={`text-[9px] font-black tracking-widest uppercase px-2 py-1 rounded-md transition-colors hover:opacity-80 ${
                    !currentLista.prazo
                      ? 'bg-slate-100 text-slate-500'
                      : isExpired ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                  }`}
                >
                  {!currentLista.prazo
                    ? 'DEFINIR PRAZO'
                    : isExpired
                      ? `EXPIRADA (${new Date(currentLista.prazo).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })})`
                      : `Prazo: ${new Date(currentLista.prazo).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
                </button>
              ) : currentLista.prazo ? (
                <span className="text-[9px] font-black tracking-widest uppercase px-2 py-1 rounded-md bg-blue-50 text-blue-600">
                  {`Prazo: ${new Date(currentLista.prazo).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
                </span>
              ) : null}
              {!isFinalized && respostas.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-[10px] font-bold border-slate-200 hover:bg-slate-50 rounded-lg px-3" 
                  onClick={() => loadRespostas(currentLista.id)}
                >
                  Sincronizar
                </Button>
              )}
            </div>
          </div>

          {/* Tabs - Modern Minimalist */}
          {respostas.length > 0 && (
            <div className="flex px-4 sm:px-8 gap-6 border-t border-slate-100">
              <button
                onClick={() => setActiveTab('planilha')}
                className={`flex items-center gap-2 py-3 text-[11px] font-black uppercase tracking-widest transition-all relative ${
                  activeTab === 'planilha' 
                    ? 'text-primary' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                Planilha
                {activeTab === 'planilha' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full" />}
              </button>
              <button
                onClick={() => setActiveTab('analise')}
                className={`flex items-center gap-2 py-3 text-[11px] font-black uppercase tracking-widest transition-all relative ${
                  activeTab === 'analise' 
                    ? 'text-primary' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Análise
                {activeTab === 'analise' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full" />}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      {showDashboard ? (
        <Dashboard onNavigate={handleDashboardNavigate} />
      ) : activeTab === 'planilha' ? (
        <SpreadsheetTable
          produtos={currentLista?.produtos ?? []}
          respostas={respostas}
          tipoPrecoMap={tipoPrecoMap}

          readOnly={false}
          highlightLowest={respostas.length > 1}
          listaId={currentLista?.id}
          onDeleteResposta={currentLista ? async (empresa: string) => {
            const { error } = await supabase
              .from('respostas')
              .delete()
              .eq('lista_id', currentLista.id)
              .eq('empresa', empresa)
              .eq('user_id', user?.id ?? '');
            if (error) {
              toast.error('Erro ao excluir dados do fornecedor.');
            } else {
              setRespostas(prev => prev.filter(r => r.empresa !== empresa));
              toast.success(`Dados de "${empresa}" excluídos com sucesso.`);
            }
          } : undefined}
          onSave={currentLista ? async (updatedProdutos) => {
            const { error } = await supabase
              .from('listas')
              .update({ produtos: updatedProdutos as any })
              .eq('id', currentLista.id)
              .eq('user_id', user?.id ?? '');
            if (error) {
              toast.error('Erro ao salvar alterações.');
            } else {
              setCurrentLista({ ...currentLista, produtos: updatedProdutos });
              toast.success('Alterações salvas com sucesso!');
            }
          } : undefined}
          onAfterSave={currentLista ? () => loadRespostas(currentLista.id) : undefined}
          onAddEmpresa={currentLista ? (async (empresa: string, states: string[]) => {
            const marker = [{ __manual_states: states }] as any;
            const { error } = await supabase
              .from('respostas')
              .insert({ lista_id: currentLista.id, empresa, resposta: marker, user_id: user?.id });
            if (error) {
              toast.error('Erro ao adicionar fornecedor.');
            } else {
              await loadRespostas(currentLista.id);
              toast.success(`Coluna "${empresa}" adicionada em ${states.join(' e ')}!`);
            }
          }) as any : undefined}
        />
      ) : (
        <AnalisePrecosPanel
          produtos={currentLista?.produtos ?? []}
          respostas={respostas}
          listaNome={currentLista?.nome}
        />
      )}

      {/* Floating button - Modernized */}
      {currentLista && !isFinalized && !showDashboard && (
        <button
          onClick={handleEncerrarClick}
          className="fixed bottom-6 right-6 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-xl shadow-slate-200 font-bold text-xs uppercase tracking-widest hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all z-50 flex items-center gap-2"
        >
          <CheckSquare className="w-4 h-4" />
          Encerrar Cotação
        </button>
      )}

      {/* 4. Encerrar Confirmation Dialog - Themed */}
      <AlertDialog open={showEncerrarDialog} onOpenChange={setShowEncerrarDialog}>
        <AlertDialogContent className="rounded-3xl border-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bold text-slate-900">Encerrar cotação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p className="text-slate-600 text-sm">Deseja encerrar a cotação <strong>"{currentLista?.nome}"</strong>? Após encerrar, fornecedores não poderão mais enviar respostas.</p>
                
                <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold uppercase tracking-wider">Links gerados</span>
                    <span className="font-black text-slate-900">{encerrarStats.total}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold uppercase tracking-wider">Responderam</span>
                    <span className="font-black text-emerald-600">{encerrarStats.responded}</span>
                  </div>
                  {encerrarStats.pending.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/50">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">Aguardando resposta de:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {encerrarStats.pending.map(emp => (
                          <span key={emp} className="text-[9px] font-black uppercase tracking-widest bg-slate-200/50 text-slate-600 px-2 py-1 rounded-md">
                            {emp}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl border-slate-200 text-xs font-bold">Continuar Aberta</AlertDialogCancel>
            <AlertDialogAction onClick={handleEncerrarConfirm} className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold">
              Encerrar Agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Panels */}
      <ImportListaPanel open={importOpen} onOpenChange={setImportOpen} onImported={() => {}} />
      <CarregarListaPanel
        open={carregarOpen}
        onOpenChange={setCarregarOpen}
        onListaSelected={lista => handleListaSelected(lista, false)}
        statusFilter="aberta"
        title="Listas Abertas"
      />
      <CarregarListaPanel
        open={finalizadasOpen}
        onOpenChange={setFinalizadasOpen}
        onListaSelected={lista => handleListaSelected(lista, true)}
        statusFilter="finalizada"
        title="Cotações Finalizadas"
        onExport={handleExport}
        onDownloadResultados={handleDownloadResultados}
      />
      <FornecedoresPanel open={fornecedoresOpen} onOpenChange={setFornecedoresOpen} />
      <AlertDialog open={prazoDialogOpen} onOpenChange={setPrazoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Prazo de expiração</AlertDialogTitle>
            <AlertDialogDescription>
              Defina a data e o horário limite para os fornecedores responderem esta cotação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Data</label>
              <input
                type="date"
                value={prazoData}
                onChange={e => setPrazoData(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Horário</label>
              <input
                type="time"
                value={prazoHora}
                onChange={e => setPrazoHora(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingPrazo}>Cancelar</AlertDialogCancel>
            {currentLista?.prazo && (
              <Button variant="outline" disabled={savingPrazo} onClick={() => savePrazo(true)}>
                Remover prazo
              </Button>
            )}
            <Button disabled={savingPrazo} onClick={() => savePrazo(false)}>
              {savingPrazo ? 'Salvando...' : 'Salvar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {currentLista && (
        <GerarLinkPanel open={gerarLinkOpen} onOpenChange={setGerarLinkOpen} listaId={currentLista.id} />
      )}
      <PerfilPanel open={perfilOpen} onOpenChange={setPerfilOpen} />

    </div>
    </ProfileGate>
  );
};

export default Index;
