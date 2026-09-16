import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { AlignLeft, AlignCenter, AlignRight, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Copy, ClipboardPaste, Bold, Italic, Paintbrush, X, Save, Percent, Search, Trash2, Plus, Swords, Trash, Filter, Check, Undo2, CheckCircle2, Loader2, AlertCircle, Scissors, Eraser, Rows3, Columns3, Snowflake, Scaling } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useEstadosUsuario } from '@/hooks/useEstadosUsuario';
import { ufNome, getPrecoUF, hasPrecoUF, buildPrecosPayload, ufsDaResposta, ordenarUFs, TIPO_LABELS, FRETE_LABELS } from '@/lib/estados';
import { isFormula, isFormulaError, evaluateFormula, ERR_CIRC } from '@/lib/spreadsheet-formula';

interface Produto {
  codigo_interno: string;
  descricao: string;
  codigo_barras: string;
  categoria?: string;
  observacao?: string;
}

interface RespostaEmpresa {
  empresa: string;
  resposta: { codigo_interno: string; preco?: number | string; preco_mt?: number | string; preco_go?: number | string; precos?: Record<string, number | string>; __manual_states?: string[] }[];
  created_at?: string;
}

interface SpreadsheetTableProps {
  produtos: Produto[];
  respostas: RespostaEmpresa[];
  readOnly?: boolean;
  editableColumn?: string;
  onPriceChange?: (rowIndex: number, preco: string) => void;
  editPrices?: Record<number, string>;
  highlightLowest?: boolean;
  onSave?: (produtos: Produto[], options?: { silent?: boolean }) => void | Promise<void>;
  listaId?: string;
  onDeleteResposta?: (empresa: string) => Promise<void>;
  onAfterSave?: () => void;
  onAddEmpresa?: (empresa: string, states: string[]) => Promise<void>;
  tipoPrecoMap?: Record<string, string>;

}

const parsePrice = (val: string | number): number => {
  if (typeof val === 'number') return val;
  if (!val || String(val).trim() === '') return Infinity;
  // Aceita "3,89", "3.89", "1.234,56", "R$ 3,89" etc.
  const clean = String(val).replace(/[^\d.,-]/g, '');
  const normalized = clean.includes(',')
    ? clean.replace(/\./g, '').replace(',', '.')
    : clean;
  const num = parseFloat(normalized);
  return isNaN(num) ? Infinity : num;
};

export const tipoPrecoLabel = (t?: string) => (t === 'NOTA' ? 'PREÇO NOTA' : 'IPI + ST');

const MIN_COL_WIDTH = 40;

const MIN_ROW_HEIGHT = 21;
const DEFAULT_ROW_HEIGHT = 25;
const HEADER_HEIGHT = 40;
const EMPTY_ROWS = 30;
const EMPTY_COLS = 8;

const spreadsheetColumnName = (index: number): string => {
  let value = index;
  let result = '';
  while (value > 0) {
    value--;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
};

type TextAlign = 'left' | 'center' | 'right';
type StateFilter = string; // UF or '__ALL__'
const ALL_STATES = '__ALL__';

interface CellPos { row: number; col: number; }

interface ContextMenuState {
  x: number; y: number;
  type: 'cell' | 'column' | 'row';
  colIdx?: number; rowIdx?: number;
}

interface ColDef {
  key: string;
  label: string;
  defaultAlign: TextAlign;
  isData: boolean;
  originalIdx: number;
  sticky?: boolean;
  highlight?: boolean;
  isSeparator?: boolean;
  state?: string;
  empresa?: string;
}

interface ColumnFilter {
  text?: string;
  min?: string;
  max?: string;
  emptyOnly?: boolean;
  winnerOnly?: boolean;
}

const SpreadsheetTable: React.FC<SpreadsheetTableProps> = ({
  produtos, respostas, readOnly = false, editableColumn, onPriceChange,
  editPrices = {}, highlightLowest = false, onSave, listaId, onDeleteResposta,
  onAfterSave, onAddEmpresa, tipoPrecoMap = {},
}) => {
  const { user } = useAuth();
  const { estados: userEstados } = useEstadosUsuario();
  const empresas = useMemo(() => respostas.map(r => r.empresa), [respostas]);

  // Data/hora formatada da resposta de cada fornecedor
  const respostaDates = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of respostas) {
      if (!r.created_at) continue;
      const d = new Date(r.created_at);
      if (isNaN(d.getTime())) continue;
      map[r.empresa] = d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
    return map;
  }, [respostas]);

  // Dynamic UFs: union of UFs present in respostas, ordered by user preference; fallback to user's configured states
  const ufs = useMemo(() => {
    const set = new Set<string>();
    for (const r of respostas) {
      for (const uf of ufsDaResposta(r.resposta as any)) set.add(uf);
      // Fornecedores adicionados manualmente: UFs vêm do marcador __manual_states
      for (const item of r.resposta as any[]) {
        if (Array.isArray(item?.__manual_states)) {
          for (const uf of item.__manual_states) set.add(String(uf).toUpperCase());
        }
      }
    }
    if (set.size === 0) {
      for (const uf of userEstados) set.add(uf);
    }
    return ordenarUFs(Array.from(set), userEstados);
  }, [respostas, userEstados]);

  // State filter
  const [stateFilter, setStateFilter] = useState<StateFilter>(ALL_STATES);

  // Check if an empresa has ANY data for a given state
  const empresaHasData = useCallback((empresa: string, state: string): boolean => {
    const resp = respostas.find(r => r.empresa === empresa);
    if (!resp) return false;
    return resp.resposta.some((item: any) => {
      if (Array.isArray(item?.__manual_states) && item.__manual_states.includes(state)) return true;
      return hasPrecoUF(item, state);
    });
  }, [respostas]);

  // Build a fast lookup map
  const precoMap = useMemo(() => {
    const map: Record<string, Record<string, number | string>> = {};
    for (const r of respostas) {
      for (const uf of ufs) {
        const inner: Record<string, number | string> = {};
        for (const item of r.resposta) {
          const v = getPrecoUF(item as any, uf);
          if (v !== undefined && v !== '') inner[item.codigo_interno] = v;
        }
        map[`${r.empresa}_${uf}`] = inner;
      }
    }
    return map;
  }, [respostas, ufs]);

  const [cellEdits, setCellEdits] = useState<Record<string, string>>({});
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveInProgressRef = useRef(false);
  const authorizedPriceColumnsRef = useRef<Set<string>>(new Set());
  const editInputRef = useRef<HTMLInputElement>(null);

  const getPreco = useCallback((empresa: string, state: string, codigoInterno: string) => {
    return precoMap[`${empresa}_${state}`]?.[codigoInterno] ?? '';
  }, [precoMap]);

  const isManualEmpresaState = useCallback((empresa: string, state: string) => {
    const resp = respostas.find(r => r.empresa === empresa);
    return Boolean(resp?.resposta.some((item: any) => Array.isArray(item?.__manual_states) && item.__manual_states.includes(state)));
  }, [respostas]);

  const authorizeOriginalPriceEdit = useCallback((empresa: string, state: string, rowIndexes: number[]): boolean => {
    const authKey = `${empresa}_${state}`;
    if (authorizedPriceColumnsRef.current.has(authKey) || isManualEmpresaState(empresa, state)) return true;
    const changesOriginal = rowIndexes.some(rowIdx => {
      const prod = produtos[rowIdx];
      if (!prod) return false;
      const raw = getPreco(empresa, state, prod.codigo_interno);
      return raw !== '' && raw !== undefined && raw !== null;
    });
    if (!changesOriginal) return true;
    const allowed = window.confirm(
      `Os preços de ${empresa} (${state}) foram enviados pelo fornecedor. Deseja liberar a edição desta coluna durante esta sessão?`
    );
    if (allowed) authorizedPriceColumnsRef.current.add(authKey);
    return allowed;
  }, [getPreco, isManualEmpresaState, produtos]);

  const getLowestEmpresa = useCallback((codigoInterno: string, state: string): string | null => {
    if (!highlightLowest || empresas.length === 0) return null;
    let lowest = Infinity;
    let lowestEmp: string | null = null;
    for (const emp of empresas) {
      const raw = getPreco(emp, state, codigoInterno);
      const val = parsePrice(raw as string | number);
      if (val < lowest && val > 0) { lowest = val; lowestEmp = emp; }
    }
    return lowestEmp;
  }, [highlightLowest, empresas, getPreco]);

  const [highlightSecond, setHighlightSecond] = useState(false);

  const getSecondEmpresa = useCallback((codigoInterno: string, state: string): string | null => {
    if (!highlightSecond || empresas.length < 2) return null;
    const list: { emp: string; val: number }[] = [];
    for (const emp of empresas) {
      const val = parsePrice(getPreco(emp, state, codigoInterno) as string | number);
      if (val > 0 && Number.isFinite(val)) list.push({ emp, val });
    }
    if (list.length < 2) return null;
    list.sort((a, b) => a.val - b.val);
    const second = list.find(x => x.val > list[0].val);
    return second ? second.emp : null;
  }, [highlightSecond, empresas, getPreco]);

  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
  const [activeColResize, setActiveColResize] = useState<number | null>(null);
  const [activeRowResize, setActiveRowResize] = useState<number | null>(null);

  const [cellAligns, setCellAligns] = useState<Record<string, TextAlign>>({});
  const [colAligns, setColAligns] = useState<Record<number, TextAlign>>({});
  const [rowAligns, setRowAligns] = useState<Record<number, TextAlign>>({});

  const [cellBold, setCellBold] = useState<Record<string, boolean>>({});
  const [cellItalic, setCellItalic] = useState<Record<string, boolean>>({});
  const [cellBgColor, setCellBgColor] = useState<Record<string, string>>({});
  const [colBold, setColBold] = useState<Record<number, boolean>>({});
  const [colItalic, setColItalic] = useState<Record<number, boolean>>({});
  const [colBgColor, setColBgColor] = useState<Record<number, string>>({});
  const [rowBold, setRowBold] = useState<Record<number, boolean>>({});
  const [rowItalic, setRowItalic] = useState<Record<number, boolean>>({});
  const [rowBgColor, setRowBgColor] = useState<Record<number, string>>({});

  const [colOrder, setColOrder] = useState<number[]>([]);
  const [rowOrder, setRowOrder] = useState<number[]>([]);

  const [dragCol, setDragCol] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);
  const [dragRow, setDragRow] = useState<number | null>(null);
  const [dragOverRow, setDragOverRow] = useState<number | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [winnerFilter, setWinnerFilter] = useState<{ empresa: string; state: string } | null>(null);

  const [activeCell, setActiveCell] = useState<CellPos | null>(null);
  const [formulaValue, setFormulaValue] = useState('');
  const [selectionAnchor, setSelectionAnchor] = useState<CellPos | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<CellPos | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [columnFilters, setColumnFilters] = useState<Record<number, ColumnFilter>>({});
  const [filterEditor, setFilterEditor] = useState<number | null>(null);
  const [filterDraft, setFilterDraft] = useState<ColumnFilter>({});
  const [frozenRows, setFrozenRows] = useState(0);
  const [frozenCols, setFrozenCols] = useState(0);

  const tableRef = useRef<HTMLTableElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // ===== Undo (desfazer última alteração) =====
  type Snapshot = Record<string, any>;
  const undoStackRef = useRef<Snapshot[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const snapshotFnRef = useRef<(() => Snapshot) | null>(null);
  const pushUndo = useCallback(() => {
    const snap = snapshotFnRef.current?.();
    if (!snap) return;
    undoStackRef.current.push(snap);
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    setUndoCount(undoStackRef.current.length);
  }, []);

  // Build ALL column definitions (unfiltered)
  const allColDefs = useMemo((): ColDef[] => {
    const cols: ColDef[] = [
      { key: '#', label: '', defaultAlign: 'center', isData: false, originalIdx: 0 },
      { key: 'cod_int', label: 'Código Interno', defaultAlign: 'center', sticky: true, isData: true, originalIdx: 1 },
      { key: 'desc', label: 'Descrição', defaultAlign: 'left', isData: true, originalIdx: 2 },
      { key: 'cod_bar', label: 'Código de Barras', defaultAlign: 'center', isData: true, originalIdx: 3 },
    ];
    let idx = 4;
    ufs.forEach((uf, ufIdx) => {
      for (let i = 0; i < empresas.length; i++) {
        cols.push({
          key: `emp_${empresas[i]}_${uf}`, label: `${empresas[i]} ${uf}`, defaultAlign: 'center',
          highlight: editableColumn === empresas[i], isData: true, originalIdx: idx++,
          state: uf, empresa: empresas[i],
        });
      }
      if (editableColumn && !empresas.includes(editableColumn)) {
        cols.push({
          key: `emp_${editableColumn}_${uf}`, label: `${editableColumn} ${uf}`, defaultAlign: 'center',
          highlight: true, isData: true, originalIdx: idx++, state: uf, empresa: editableColumn,
        });
      }
      if (ufIdx < ufs.length - 1) {
        cols.push({ key: `separator_${uf}`, label: '', defaultAlign: 'center', isData: false, isSeparator: true, originalIdx: idx++ });
      }
    });
    return cols;
  }, [empresas, editableColumn, ufs]);

  // Filter columns based on state filter and remove empty empresa columns, then add fillers
  const baseColDefs = useMemo((): ColDef[] => {
    let filtered: ColDef[];
    if (stateFilter === ALL_STATES) {
      filtered = allColDefs;
    } else {
      filtered = allColDefs.filter(c => {
        if (c.isSeparator) return false;
        if (c.state && c.state !== stateFilter) return false;
        return true;
      });
    }
    // Remove empresa columns that have NO data at all
    filtered = filtered.filter(c => {
      if (!c.empresa || !c.state) return true;
      return empresaHasData(c.empresa, c.state);
    });
    // Add filler columns to fill remaining container space
    const FILLER_WIDTH = 80;
    // Use generous filler count to always fill viewport; extra fillers beyond viewport are harmless
    const fillerCount = Math.max(EMPTY_COLS, 20);
    let maxIdx = filtered.reduce((m, c) => Math.max(m, c.originalIdx), 0);
    const fillers: ColDef[] = [];
    for (let i = 0; i < fillerCount; i++) {
      fillers.push({ key: `filler_${i}`, label: '', defaultAlign: 'center', isData: false, originalIdx: ++maxIdx });
    }
    return [...filtered, ...fillers];
  }, [allColDefs, stateFilter, empresaHasData]);

  const fillerRows = produtos.length > 0 ? Math.max(0, EMPTY_ROWS - produtos.length) : EMPTY_ROWS;

  // Initialize column order when baseColDefs changes
  useEffect(() => {
    setColOrder(baseColDefs.map((_, i) => i));
    // Reset colWidths on filter change to trigger auto-fit
    setColWidths({});
  }, [baseColDefs.length, stateFilter]);

  useEffect(() => {
    const total = produtos.length + fillerRows;
    setRowOrder(Array.from({ length: total }, (_, i) => i));
  }, [produtos.length, fillerRows]);

  const orderedColDefs = useMemo(() =>
    colOrder.length === baseColDefs.length
      ? colOrder.map(i => ({ ...baseColDefs[i], orderIdx: i }))
      : baseColDefs.map((c, i) => ({ ...c, orderIdx: i })),
    [colOrder, baseColDefs]
  );

  const totalRows = produtos.length + fillerRows;

  // Measure header text widths to enforce as minimums
  const headerMinWidths = useRef<Record<number, number>>({});

  // Auto-fit column widths - debounced, runs once after data settles
  const autoFitRan = useRef(false);
  useEffect(() => {
    autoFitRan.current = false;
  }, [stateFilter, empresas.length, produtos.length]);

  useEffect(() => {
    if (!tableRef.current || !containerRef.current || autoFitRan.current) return;
    const timer = setTimeout(() => {
      if (!tableRef.current || !containerRef.current) return;
      autoFitRan.current = true;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.font = '600 11px system-ui, sans-serif'; // matches header font

      const newWidths: Record<number, number> = {};
      const newHeaderMins: Record<number, number> = {};
      const totalCols = orderedColDefs.length;

      for (let i = 0; i < totalCols; i++) {
        const col = orderedColDefs[i];
        if (col.isSeparator) { newWidths[i] = 8; newHeaderMins[i] = 8; continue; }
        if (col.key.startsWith('filler_')) continue;

        // Measure header text width
        const headerText = col.label;
        const headerW = ctx.measureText(headerText).width + 28; // padding + sort icon space

        // Measure content via DOM (sample first 50 rows for performance)
        let maxContentW = 0;
        const cells = tableRef.current!.querySelectorAll(`tbody td:nth-child(${i + 1})`);
        let measured = 0;
        cells.forEach(cell => {
          if (measured >= 50) return;
          measured++;
          const el = cell as HTMLElement;
          const text = el.textContent || '';
          if (!text.trim()) return;
          ctx.font = '12px system-ui, sans-serif';
          const w = ctx.measureText(text).width + 20; // padding
          if (w > maxContentW) maxContentW = w;
        });

        const minW = i === 0 ? 36 : Math.max(MIN_COL_WIDTH, headerW);
        newHeaderMins[i] = minW;
        newWidths[i] = Math.max(minW, maxContentW, i === 2 ? 180 : i === 0 ? 36 : 70);
      }

      // Set filler columns to standard width
      for (let i = 0; i < totalCols; i++) {
        const col = orderedColDefs[i];
        if (col.key.startsWith('filler_')) {
          newWidths[i] = 80;
          newHeaderMins[i] = 80;
        }
      }

      headerMinWidths.current = newHeaderMins;
      setColWidths(newWidths);
    }, 120);
    return () => clearTimeout(timer);
  }, [baseColDefs, produtos, respostas, orderedColDefs]);

  const getColWidth = useCallback((i: number) => colWidths[i] || (i === 0 ? 36 : i === 2 ? 180 : 70), [colWidths]);

  const getCellAlign = (colIdx: number, rowIdx: number, defaultAlign: TextAlign): TextAlign => {
    const cellKey = `${rowIdx}-${colIdx}`;
    if (cellAligns[cellKey]) return cellAligns[cellKey];
    if (rowAligns[rowIdx]) return rowAligns[rowIdx];
    if (colAligns[colIdx]) return colAligns[colIdx];
    return defaultAlign;
  };

  const alignClass = (align: TextAlign) => align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';

  const getCellFormatting = (colIdx: number, rowIdx: number) => {
    const key = `${rowIdx}-${colIdx}`;
    return {
      bold: cellBold[key] ?? rowBold[rowIdx] ?? colBold[colIdx] ?? false,
      italic: cellItalic[key] ?? rowItalic[rowIdx] ?? colItalic[colIdx] ?? false,
      bgColor: cellBgColor[key] || rowBgColor[rowIdx] || colBgColor[colIdx] || '',
    };
  };

  const getSelectionRange = useCallback(() => {
    if (!selectionAnchor || !selectionEnd) {
      if (activeCell) return { minRow: activeCell.row, maxRow: activeCell.row, minCol: activeCell.col, maxCol: activeCell.col };
      return null;
    }
    return {
      minRow: Math.min(selectionAnchor.row, selectionEnd.row),
      maxRow: Math.max(selectionAnchor.row, selectionEnd.row),
      minCol: Math.min(selectionAnchor.col, selectionEnd.col),
      maxCol: Math.max(selectionAnchor.col, selectionEnd.col),
    };
  }, [selectionAnchor, selectionEnd, activeCell]);

  const authorizeRangeEdit = useCallback((range: { minRow: number; maxRow: number; minCol: number; maxCol: number }) => {
    const protectedColumns = new Map<string, { empresa: string; state: string; rows: number[] }>();
    for (let c = range.minCol; c <= range.maxCol; c++) {
      const col = orderedColDefs[c];
      if (!col?.empresa || !col.state) continue;
      protectedColumns.set(`${col.empresa}_${col.state}`, {
        empresa: col.empresa,
        state: col.state,
        rows: Array.from({ length: range.maxRow - range.minRow + 1 }, (_, i) => range.minRow + i).filter(row => row < produtos.length),
      });
    }
    return [...protectedColumns.values()].every(item => authorizeOriginalPriceEdit(item.empresa, item.state, item.rows));
  }, [orderedColDefs, produtos.length, authorizeOriginalPriceEdit]);

  const updateSelectedCells = useCallback((valueFor: (row: number, col: number, range: { minRow: number; maxRow: number; minCol: number; maxCol: number }) => string) => {
    const range = getSelectionRange();
    if (!range || readOnly || !authorizeRangeEdit(range)) return;
    pushUndo();
    const edits: Record<string, string> = {};
    for (let row = range.minRow; row <= Math.min(range.maxRow, produtos.length - 1); row++) {
      for (let col = range.minCol; col <= range.maxCol; col++) {
        const def = orderedColDefs[col];
        if (def?.isData) edits[`${row}-${def.originalIdx}`] = valueFor(row, col, range);
      }
    }
    if (Object.keys(edits).length === 0) return;
    setCellEdits(prev => ({ ...prev, ...edits }));
    setHasUnsavedChanges(true);
    setSaveStatus('idle');
  }, [getSelectionRange, readOnly, authorizeRangeEdit, pushUndo, produtos.length, orderedColDefs]);

  const isCellSelected = useCallback((row: number, col: number): boolean => {
    const range = getSelectionRange();
    if (!range) return false;
    return row >= range.minRow && row <= range.maxRow && col >= range.minCol && col <= range.maxCol;
  }, [getSelectionRange]);

  const isCellActive = useCallback((row: number, col: number): boolean => {
    return activeCell?.row === row && activeCell?.col === col;
  }, [activeCell]);

  const getCellValue = useCallback((rowIdx: number, colIdx: number): string => {
    if (rowIdx >= produtos.length) return '';
    const prod = produtos[rowIdx];
    const colDef = orderedColDefs[colIdx];
    if (!colDef) return '';
    const origIdx = colDef.originalIdx;
    const edited = cellEdits[`${rowIdx}-${origIdx}`];
    if (edited !== undefined) return edited;
    if (origIdx === 0) return String(rowIdx + 1);
    if (origIdx === 1) return prod.codigo_interno;
    if (origIdx === 2) return prod.descricao;
    if (origIdx === 3) return prod.codigo_barras;
    if (colDef.state && colDef.empresa) {
      const emp = colDef.empresa;
      if (editableColumn === emp && editPrices[rowIdx] !== undefined) return editPrices[rowIdx];
      const raw = getPreco(emp, colDef.state, prod.codigo_interno);
      if (raw === '' || raw === undefined || raw === null) return 'R$ -';
      const num = parsePrice(raw as string | number);
      return num === Infinity ? String(raw) : Number(num).toFixed(2).replace('.', ',');
    }
    return '';
  }, [produtos, orderedColDefs, editableColumn, editPrices, getPreco, cellEdits]);

  const clearSelection = useCallback(() => updateSelectedCells(() => ''), [updateSelectedCells]);
  const fillDown = useCallback(() => updateSelectedCells((_row, col, range) => getCellValue(range.minRow, col)), [updateSelectedCells, getCellValue]);
  const fillRight = useCallback(() => updateSelectedCells((row, _col, range) => getCellValue(row, range.minCol)), [updateSelectedCells, getCellValue]);
  const applyFormulaValueToSelection = useCallback(() => updateSelectedCells(() => formulaValue), [updateSelectedCells, formulaValue]);
  const duplicateSelection = useCallback(() => {
    const range = getSelectionRange();
    if (!range || readOnly) return;
    const height = range.maxRow - range.minRow + 1;
    const targetMaxRow = Math.min(produtos.length - 1, range.maxRow + height);
    if (targetMaxRow <= range.maxRow) return;
    const targetRange = { ...range, minRow: range.maxRow + 1, maxRow: targetMaxRow };
    if (!authorizeRangeEdit(targetRange)) return;
    pushUndo();
    const edits: Record<string, string> = {};
    for (let row = targetRange.minRow; row <= targetRange.maxRow; row++) {
      for (let col = range.minCol; col <= range.maxCol; col++) {
        const def = orderedColDefs[col];
        if (def?.isData) edits[`${row}-${def.originalIdx}`] = getCellValue(range.minRow + ((row - targetRange.minRow) % height), col);
      }
    }
    setCellEdits(prev => ({ ...prev, ...edits }));
    setSelectionAnchor({ row: targetRange.minRow, col: range.minCol });
    setSelectionEnd({ row: targetRange.maxRow, col: range.maxCol });
    setActiveCell({ row: targetRange.minRow, col: range.minCol });
    setHasUnsavedChanges(true);
    setSaveStatus('idle');
  }, [getSelectionRange, readOnly, produtos.length, authorizeRangeEdit, pushUndo, orderedColDefs, getCellValue]);

  useEffect(() => {
    setFormulaValue(activeCell ? getCellValue(activeCell.row, activeCell.col) : '');
  }, [activeCell, getCellValue, cellEdits]);

  const commitFormulaBar = useCallback(() => {
    if (!activeCell || readOnly || activeCell.row >= produtos.length) return;
    const col = orderedColDefs[activeCell.col];
    if (!col?.isData) return;
    if (col.empresa && col.state && !authorizeOriginalPriceEdit(col.empresa, col.state, [activeCell.row])) {
      setFormulaValue(getCellValue(activeCell.row, activeCell.col));
      return;
    }
    const current = getCellValue(activeCell.row, activeCell.col);
    if (formulaValue === current) return;
    pushUndo();
    setCellEdits(prev => ({ ...prev, [`${activeCell.row}-${col.originalIdx}`]: formulaValue }));
    setHasUnsavedChanges(true);
    setSaveStatus('idle');
  }, [activeCell, readOnly, produtos.length, orderedColDefs, authorizeOriginalPriceEdit, getCellValue, formulaValue, pushUndo]);

  const handleCellClick = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (col === 0) return;
    if (e.shiftKey && activeCell) {
      setSelectionEnd({ row, col });
    } else {
      setActiveCell({ row, col });
      setSelectionAnchor({ row, col });
      setSelectionEnd({ row, col });
    }
    setContextMenu(null);
  }, [activeCell]);

  const handleCellDoubleClick = useCallback((row: number, visualCol: number, origIdx: number) => {
    if (readOnly) return;
    const editKey = `${row}-${origIdx}`;
    let currentVal = cellEdits[editKey];
    if (currentVal === undefined && row < produtos.length) {
      const prod = produtos[row];
      const colDef = orderedColDefs.find(c => c.originalIdx === origIdx);
      if (origIdx === 1) currentVal = prod.codigo_interno;
      else if (origIdx === 2) currentVal = prod.descricao;
      else if (origIdx === 3) currentVal = prod.codigo_barras;
      else if (colDef?.state && colDef?.empresa) {
        if (!authorizeOriginalPriceEdit(colDef.empresa, colDef.state, [row])) return;
        const raw = getPreco(colDef.empresa, colDef.state, prod.codigo_interno);
        if (raw === '' || raw === undefined || raw === null) currentVal = '';
        else {
          const num = parsePrice(raw as string | number);
          currentVal = num === Infinity ? String(raw) : Number(num).toFixed(2).replace('.', ',');
        }
      } else currentVal = '';
    }
    setEditingCell({ row, col: visualCol });
    setEditingValue(currentVal ?? '');
    setTimeout(() => editInputRef.current?.focus(), 0);
  }, [readOnly, cellEdits, produtos, orderedColDefs, getPreco, authorizeOriginalPriceEdit]);

  const commitEdit = useCallback((origIdx: number) => {
    if (!editingCell) return;
    const editKey = `${editingCell.row}-${origIdx}`;
    pushUndo();
    setCellEdits(prev => ({ ...prev, [editKey]: editingValue }));
    setHasUnsavedChanges(true);
    setEditingCell(null);
  }, [editingCell, editingValue]);

  const cancelEdit = useCallback(() => setEditingCell(null), []);

  const getDisplayValue = useCallback((row: number, origIdx: number): string => {
    const editKey = `${row}-${origIdx}`;
    if (cellEdits[editKey] !== undefined) return cellEdits[editKey];
    if (row >= produtos.length) return '';
    const prod = produtos[row];
    if (origIdx === 1) return prod.codigo_interno;
    if (origIdx === 2) return prod.descricao;
    if (origIdx === 3) return prod.codigo_barras;
    // Use allColDefs to find by originalIdx (works regardless of filter)
    const colDef = allColDefs.find(c => c.originalIdx === origIdx);
    if (colDef?.state && colDef?.empresa) {
      const raw = getPreco(colDef.empresa, colDef.state, prod.codigo_interno);
      if (raw === '' || raw === undefined || raw === null) return '';
      const num = parsePrice(raw as string | number);
      return num === Infinity ? String(raw) : Number(num).toFixed(2).replace('.', ',');
    }
    return '';
  }, [cellEdits, produtos, allColDefs, getPreco]);

  // ---- Fórmulas (=SOMA(A1:A10), =A1*2, =SE(...), ...) ----
  const evalStackRef = useRef<Set<string>>(new Set());
  const evalRaw = useCallback((raw: string, key: string): string => {
    if (!isFormula(raw)) return raw;
    if (evalStackRef.current.has(key)) return ERR_CIRC;
    evalStackRef.current.add(key);
    try {
      return evaluateFormula(raw, (r, c) => {
        const def = orderedColDefs[c];
        if (!def) return '';
        return evalRaw(getCellValue(r, c), `${r}-${def.originalIdx}`);
      });
    } finally {
      evalStackRef.current.delete(key);
    }
  }, [getCellValue, orderedColDefs]);

  const computeDisplayValue = useCallback((row: number, origIdx: number): string =>
    evalRaw(getDisplayValue(row, origIdx), `${row}-${origIdx}`), [evalRaw, getDisplayValue]);

  const resolveStoredValue = useCallback((row: number, origIdx: number, value: string): string => {
    if (!isFormula(value)) return value;
    const result = evalRaw(value, `${row}-${origIdx}`);
    return isFormulaError(result) ? '' : result;
  }, [evalRaw]);

  // Save handler
  const handleSave = useCallback(async (silent = false) => {
    if (saveInProgressRef.current || !hasUnsavedChanges) return;
    saveInProgressRef.current = true;
    setSaveStatus('saving');
    const updated = produtos.map((prod, rowIdx) => ({
      ...prod,
      codigo_interno: cellEdits[`${rowIdx}-1`] !== undefined ? resolveStoredValue(rowIdx, 1, cellEdits[`${rowIdx}-1`]) : prod.codigo_interno,
      descricao: cellEdits[`${rowIdx}-2`] !== undefined ? resolveStoredValue(rowIdx, 2, cellEdits[`${rowIdx}-2`]) : prod.descricao,
      codigo_barras: cellEdits[`${rowIdx}-3`] !== undefined ? resolveStoredValue(rowIdx, 3, cellEdits[`${rowIdx}-3`]) : prod.codigo_barras,
    }));
    try {
      if (onSave) await onSave(updated, { silent });

      if (listaId) {
      const priceEditsByEmpresa: Record<string, { rowIdx: number; value: string; state: string }[]> = {};
      for (const [key, value] of Object.entries(cellEdits)) {
        const [rowStr, origIdxStr] = key.split('-');
        const rowIdx = parseInt(rowStr);
        const origIdx = parseInt(origIdxStr);
        if (rowIdx >= produtos.length) continue;
        const colDef = allColDefs.find(c => c.originalIdx === origIdx);
        if (colDef?.state && colDef?.empresa) {
          const emp = colDef.empresa;
          if (!priceEditsByEmpresa[emp]) priceEditsByEmpresa[emp] = [];
          priceEditsByEmpresa[emp].push({ rowIdx, value: resolveStoredValue(rowIdx, origIdx, value), state: colDef.state });
        }
      }

      for (const [emp, edits] of Object.entries(priceEditsByEmpresa)) {
        const existingResp = respostas.find(r => r.empresa === emp);
        const currentItems: any[] = existingResp ? [...existingResp.resposta] : [];
        for (const edit of edits) {
          const prod = produtos[edit.rowIdx];
          const numParsed = parsePrice(edit.value);
          const preco = numParsed === Infinity ? 0 : numParsed;
          const existingIdx = currentItems.findIndex((i: any) => i.codigo_interno === prod.codigo_interno);
          const payload = buildPrecosPayload({ [edit.state]: String(preco) });
          const mergedPrecos = { ...(existingIdx >= 0 ? currentItems[existingIdx]?.precos : undefined), ...payload.precos };
          const extra: any = { precos: mergedPrecos };
          if (payload.preco_mt !== undefined) extra.preco_mt = payload.preco_mt;
          if (payload.preco_go !== undefined) extra.preco_go = payload.preco_go;
          if (existingIdx >= 0) {
            currentItems[existingIdx] = { ...currentItems[existingIdx], ...extra };
          } else {
            currentItems.push({ codigo_interno: prod.codigo_interno, ...extra });
          }
        }
        if (existingResp) {
          const { error } = await supabase.from('respostas').update({ resposta: currentItems as any }).eq('lista_id', listaId).eq('empresa', emp).eq('user_id', user?.id ?? '');
          if (error) throw error;
        } else {
          const { error } = await supabase.from('respostas').insert({ lista_id: listaId, empresa: emp, resposta: currentItems as any, user_id: user?.id });
          if (error) throw error;
        }
      }
      }
      setCellEdits({});
      setHasUnsavedChanges(false);
      setSaveStatus('saved');
      if (onAfterSave) await onAfterSave();
    } catch (error) {
      console.error('Erro ao salvar planilha:', error);
      setSaveStatus('error');
    } finally {
      saveInProgressRef.current = false;
    }
  }, [onSave, produtos, cellEdits, allColDefs, respostas, listaId, onAfterSave, user?.id, hasUnsavedChanges, resolveStoredValue]);

  useEffect(() => {
    if (!hasUnsavedChanges || saveStatus === 'saving') return;
    const timer = window.setTimeout(() => { void handleSave(true); }, 1800);
    return () => window.clearTimeout(timer);
  }, [hasUnsavedChanges, cellEdits, handleSave, saveStatus]);

  // Mouse selection
  const handleCellMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (col === 0 || e.button !== 0 || e.shiftKey) return;
    setIsSelecting(true);
    setActiveCell({ row, col });
    setSelectionAnchor({ row, col });
    setSelectionEnd({ row, col });
  }, []);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    if (!isSelecting || col === 0) return;
    setSelectionEnd({ row, col });
  }, [isSelecting]);

  useEffect(() => {
    const handleMouseUp = () => setIsSelecting(false);
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeCell) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && !['ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Escape'].includes(e.key)) return;
      const maxCol = orderedColDefs.length - 1;
      const maxRow = totalRows - 1;
      let newRow = activeCell.row;
      let newCol = activeCell.col;
      if (!readOnly && target.tagName !== 'INPUT' && (e.key === 'Delete' || e.key === 'Backspace')) {
        const range = getSelectionRange();
        if (!range) return;
        e.preventDefault();
        clearSelection();
        return;
      }
      if (!readOnly && target.tagName !== 'INPUT' && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const col = orderedColDefs[activeCell.col];
        if (activeCell.row < produtos.length && col?.isData && (!col.empresa || !col.state || authorizeOriginalPriceEdit(col.empresa, col.state, [activeCell.row]))) {
          e.preventDefault();
          handleCellDoubleClick(activeCell.row, activeCell.col, col.originalIdx);
          setEditingValue(e.key);
        }
        return;
      }
      switch (e.key) {
        case 'ArrowUp': e.preventDefault(); newRow = Math.max(0, activeCell.row - 1); break;
        case 'ArrowDown': e.preventDefault(); newRow = Math.min(maxRow, activeCell.row + 1); break;
        case 'ArrowLeft':
          if (target.tagName === 'INPUT') return;
          e.preventDefault(); newCol = Math.max(1, activeCell.col - 1); break;
        case 'ArrowRight':
          if (target.tagName === 'INPUT') return;
          e.preventDefault(); newCol = Math.min(maxCol, activeCell.col + 1); break;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) { newCol = activeCell.col - 1; if (newCol < 1) { newCol = maxCol; newRow = Math.max(0, activeCell.row - 1); } }
          else { newCol = activeCell.col + 1; if (newCol > maxCol) { newCol = 1; newRow = Math.min(maxRow, activeCell.row + 1); } }
          break;
        case 'Enter':
          e.preventDefault();
          newRow = e.shiftKey ? Math.max(0, activeCell.row - 1) : Math.min(maxRow, activeCell.row + 1);
          break;
        case 'Escape':
          setActiveCell(null); setSelectionAnchor(null); setSelectionEnd(null); return;
        default: return;
      }
      const pos = { row: newRow, col: newCol };
      setActiveCell(pos);
      if (e.shiftKey && e.key.startsWith('Arrow')) setSelectionEnd(pos);
      else { setSelectionAnchor(pos); setSelectionEnd(pos); }
      const cell = tableRef.current?.querySelector(`[data-cell="${newRow}-${newCol}"]`) as HTMLElement;
      cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeCell, orderedColDefs, totalRows, readOnly, getSelectionRange, authorizeOriginalPriceEdit, produtos.length, handleCellDoubleClick, clearSelection]);

  // Copy
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      const range = getSelectionRange();
      if (!range) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        if (input.selectionStart !== input.selectionEnd) return;
      }
      e.preventDefault();
      const lines: string[] = [];
      for (let r = range.minRow; r <= range.maxRow; r++) {
        const cells: string[] = [];
        for (let c = range.minCol; c <= range.maxCol; c++) cells.push(getCellValue(r, c));
        lines.push(cells.join('\t'));
      }
      e.clipboardData?.setData('text/plain', lines.join('\n'));
    };
    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  }, [getSelectionRange, getCellValue]);

  // Cut
  useEffect(() => {
    const handleCut = (e: ClipboardEvent) => {
      const range = getSelectionRange();
      if (!range || readOnly) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (!authorizeRangeEdit(range)) return;
      e.preventDefault();
      const lines: string[] = [];
      for (let row = range.minRow; row <= range.maxRow; row++) {
        const values: string[] = [];
        for (let col = range.minCol; col <= range.maxCol; col++) values.push(getCellValue(row, col));
        lines.push(values.join('\t'));
      }
      e.clipboardData?.setData('text/plain', lines.join('\n'));
      clearSelection();
    };
    document.addEventListener('cut', handleCut);
    return () => document.removeEventListener('cut', handleCut);
  }, [getSelectionRange, readOnly, authorizeRangeEdit, getCellValue, clearSelection]);

  // Paste
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!activeCell || readOnly) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') return;
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      const lines = text.split('\n').map(l => l.split('\t'));
      const protectedColumns = new Map<string, { empresa: string; state: string; rows: number[] }>();
      for (let c = 0; c < Math.max(...lines.map(line => line.length)); c++) {
        const col = orderedColDefs[activeCell.col + c];
        if (!col?.empresa || !col.state) continue;
        protectedColumns.set(`${col.empresa}_${col.state}`, {
          empresa: col.empresa, state: col.state,
          rows: lines.map((_, r) => activeCell.row + r).filter(row => row < produtos.length),
        });
      }
      if ([...protectedColumns.values()].some(item => !authorizeOriginalPriceEdit(item.empresa, item.state, item.rows))) return;
      e.preventDefault();
      pushUndo();
      const edits: Record<string, string> = {};
      for (let r = 0; r < lines.length; r++) {
        for (let c = 0; c < lines[r].length; c++) {
          const targetRow = activeCell.row + r;
          const targetCol = activeCell.col + c;
          if (targetRow >= produtos.length) continue;
          const colDef = orderedColDefs[targetCol];
          if (!colDef) continue;
          const origIdx = colDef.originalIdx;
          if (colDef.isData) edits[`${targetRow}-${origIdx}`] = lines[r][c].trim();
        }
      }
      if (Object.keys(edits).length > 0) {
        setCellEdits(prev => ({ ...prev, ...edits }));
        setHasUnsavedChanges(true);
        setSaveStatus('idle');
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [activeCell, readOnly, orderedColDefs, produtos.length, authorizeOriginalPriceEdit, pushUndo]);

  // Column resize
  const handleColResizeStart = useCallback((e: React.MouseEvent, colIdx: number) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startW = getColWidth(colIdx);
    setActiveColResize(colIdx);
    const minW = headerMinWidths.current[colIdx] || MIN_COL_WIDTH;
    const onMouseMove = (ev: MouseEvent) => {
      setColWidths(prev => ({ ...prev, [colIdx]: Math.max(minW, startW + ev.clientX - startX) }));
    };
    const onMouseUp = () => {
      setActiveColResize(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = ''; document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [getColWidth]);

  // Row resize
  const handleRowResizeStart = useCallback((e: React.MouseEvent, rowIdx: number) => {
    e.preventDefault(); e.stopPropagation();
    const startY = e.clientY;
    const startH = rowHeights[rowIdx] || DEFAULT_ROW_HEIGHT;
    setActiveRowResize(rowIdx);
    const onMouseMove = (ev: MouseEvent) => {
      setRowHeights(prev => ({ ...prev, [rowIdx]: Math.max(MIN_ROW_HEIGHT, startH + ev.clientY - startY) }));
    };
    const onMouseUp = () => {
      setActiveRowResize(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = ''; document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [rowHeights]);

  const handleColAutoFit = useCallback((colIdx: number) => {
    if (!tableRef.current) return;
    const cells = tableRef.current.querySelectorAll(`thead th:nth-child(${colIdx + 1}), tbody td:nth-child(${colIdx + 1})`);
    let max = MIN_COL_WIDTH;
    cells.forEach(cell => {
      const el = cell as HTMLElement;
      const prev = el.style.width; el.style.width = 'auto';
      const w = el.scrollWidth + 12; el.style.width = prev;
      if (w > max) max = w;
    });
    setColWidths(prev => ({ ...prev, [colIdx]: max }));
  }, []);

  const handleAutoFitAll = useCallback(() => {
    for (let colIdx = 0; colIdx < orderedColDefs.length; colIdx++) handleColAutoFit(colIdx);
    setRowHeights({});
  }, [orderedColDefs.length, handleColAutoFit]);

  const getFrozenLeft = useCallback((visualColIdx: number) => {
    let left = 0;
    for (let index = 0; index < visualColIdx; index++) left += getColWidth(index);
    return left;
  }, [getColWidth]);

  const handleRowAutoFit = useCallback((rowIdx: number) => {
    setRowHeights(prev => { const copy = { ...prev }; delete copy[rowIdx]; return copy; });
  }, []);

  // Column drag
  const handleColDragStart = (e: React.DragEvent, colIdx: number) => { if (colIdx === 0) return; e.dataTransfer.effectAllowed = 'move'; setDragCol(colIdx); };
  const handleColDragOver = (e: React.DragEvent, colIdx: number) => { if (dragCol === null || colIdx === 0) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCol(colIdx); };
  const handleColDrop = (e: React.DragEvent, colIdx: number) => {
    e.preventDefault();
    if (dragCol === null || dragCol === colIdx || colIdx === 0) { setDragCol(null); setDragOverCol(null); return; }
    setColOrder(prev => {
      const order = [...prev]; const fromPos = order.indexOf(dragCol); const toPos = order.indexOf(colIdx);
      if (fromPos === -1 || toPos === -1) return order;
      const [moved] = order.splice(fromPos, 1); order.splice(toPos, 0, moved); return order;
    });
    setDragCol(null); setDragOverCol(null);
  };
  const handleColDragEnd = () => { setDragCol(null); setDragOverCol(null); };

  // Row drag
  const handleRowDragStart = (e: React.DragEvent, rowIdx: number) => { e.dataTransfer.effectAllowed = 'move'; setDragRow(rowIdx); };
  const handleRowDragOver = (e: React.DragEvent, rowIdx: number) => { if (dragRow === null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverRow(rowIdx); };
  const handleRowDrop = (e: React.DragEvent, rowIdx: number) => {
    e.preventDefault();
    if (dragRow === null || dragRow === rowIdx) { setDragRow(null); setDragOverRow(null); return; }
    setRowOrder(prev => {
      const order = [...prev]; const fromPos = order.indexOf(dragRow); const toPos = order.indexOf(rowIdx);
      if (fromPos === -1 || toPos === -1) return order;
      const [moved] = order.splice(fromPos, 1); order.splice(toPos, 0, moved); return order;
    });
    setDragRow(null); setDragOverRow(null);
  };
  const handleRowDragEnd = () => { setDragRow(null); setDragOverRow(null); };

  // Context menu
  const handleContextMenu = (e: React.MouseEvent, type: 'cell' | 'column' | 'row', colIdx?: number, rowIdx?: number) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, colIdx, rowIdx });
  };

  const setAlignment = (align: TextAlign) => {
    if (!contextMenu) return;
    pushUndo();
    const { type, colIdx, rowIdx } = contextMenu;
    if (type === 'cell' && colIdx !== undefined && rowIdx !== undefined) setCellAligns(prev => ({ ...prev, [`${rowIdx}-${colIdx}`]: align }));
    else if (type === 'column' && colIdx !== undefined) setColAligns(prev => ({ ...prev, [colIdx]: align }));
    else if (type === 'row' && rowIdx !== undefined) setRowAligns(prev => ({ ...prev, [rowIdx]: align }));
    setContextMenu(null);
  };

  const moveColumn = (direction: 'left' | 'right') => {
    if (!contextMenu || contextMenu.colIdx === undefined) return;
    const colIdx = contextMenu.colIdx;
    pushUndo();
    setColOrder(prev => {
      const order = [...prev]; const pos = order.indexOf(colIdx);
      if (pos === -1) return order;
      const newPos = direction === 'left' ? pos - 1 : pos + 1;
      if (newPos < 1 || newPos >= order.length) return order;
      const [moved] = order.splice(pos, 1); order.splice(newPos, 0, moved); return order;
    });
    setContextMenu(null);
  };

  const moveRow = (direction: 'up' | 'down') => {
    if (!contextMenu || contextMenu.rowIdx === undefined) return;
    const rowIdx = contextMenu.rowIdx;
    pushUndo();
    setRowOrder(prev => {
      const order = [...prev]; const pos = order.indexOf(rowIdx);
      if (pos === -1) return order;
      const newPos = direction === 'up' ? pos - 1 : pos + 1;
      if (newPos < 0 || newPos >= order.length) return order;
      const [moved] = order.splice(pos, 1); order.splice(newPos, 0, moved); return order;
    });
    setContextMenu(null);
  };

  const BG_COLORS = [
    { label: 'Amarelo', value: '#FEF9C3' }, { label: 'Verde', value: '#DCFCE7' },
    { label: 'Azul', value: '#DBEAFE' }, { label: 'Rosa', value: '#FCE7F3' },
    { label: 'Laranja', value: '#FED7AA' }, { label: 'Roxo', value: '#E9D5FF' },
    { label: 'Cinza', value: '#F3F4F6' },
  ];

  const toggleBold = () => {
    if (!contextMenu) return;
    pushUndo();
    const { type, colIdx, rowIdx } = contextMenu;
    if (type === 'cell' && colIdx !== undefined && rowIdx !== undefined) { const key = `${rowIdx}-${colIdx}`; setCellBold(prev => ({ ...prev, [key]: !prev[key] })); }
    else if (type === 'column' && colIdx !== undefined) setColBold(prev => ({ ...prev, [colIdx]: !prev[colIdx] }));
    else if (type === 'row' && rowIdx !== undefined) setRowBold(prev => ({ ...prev, [rowIdx]: !prev[rowIdx] }));
    setContextMenu(null);
  };

  const toggleItalic = () => {
    if (!contextMenu) return;
    pushUndo();
    const { type, colIdx, rowIdx } = contextMenu;
    if (type === 'cell' && colIdx !== undefined && rowIdx !== undefined) { const key = `${rowIdx}-${colIdx}`; setCellItalic(prev => ({ ...prev, [key]: !prev[key] })); }
    else if (type === 'column' && colIdx !== undefined) setColItalic(prev => ({ ...prev, [colIdx]: !prev[colIdx] }));
    else if (type === 'row' && rowIdx !== undefined) setRowItalic(prev => ({ ...prev, [rowIdx]: !prev[rowIdx] }));
    setContextMenu(null);
  };

  const setBgColor = (color: string) => {
    if (!contextMenu) return;
    pushUndo();
    const { type, colIdx, rowIdx } = contextMenu;
    if (type === 'cell' && colIdx !== undefined && rowIdx !== undefined) setCellBgColor(prev => ({ ...prev, [`${rowIdx}-${colIdx}`]: color }));
    else if (type === 'column' && colIdx !== undefined) setColBgColor(prev => ({ ...prev, [colIdx]: color }));
    else if (type === 'row' && rowIdx !== undefined) setRowBgColor(prev => ({ ...prev, [rowIdx]: color }));
    setContextMenu(null);
  };

  const deleteRow = (rowIdx: number) => {
    if (readOnly || rowIdx >= produtos.length) return;
    pushUndo();
    const updated = produtos.filter((_, i) => i !== rowIdx);
    if (onSave) onSave(updated);
    setContextMenu(null);
  };

  const addRow = () => {
    if (readOnly) return;
    pushUndo();
    const newProd: Produto = {
      codigo_interno: `NOVO-${Date.now().toString().slice(-4)}`,
      descricao: 'Novo Produto',
      codigo_barras: '',
    };
    const updated = [...produtos, newProd];
    if (onSave) onSave(updated);
  };

  const handleCopyFromMenu = () => { document.execCommand('copy'); setContextMenu(null); };
  const handlePasteFromMenu = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!activeCell || readOnly || !text) return;
      const lines = text.split('\n').map(l => l.split('\t'));
      for (let r = 0; r < lines.length; r++) {
        for (let c = 0; c < lines[r].length; c++) {
          const targetRow = activeCell.row + r;
          const targetCol = activeCell.col + c;
          if (targetRow >= produtos.length) continue;
          const colDef = orderedColDefs[targetCol];
          if (!colDef) continue;
          const origIdx = colDef.originalIdx;
          const isEditableEmpCol = origIdx >= 4 && editableColumn && (
            (origIdx < 4 + empresas.length && empresas[origIdx - 4] === editableColumn) ||
            (!empresas.includes(editableColumn) && origIdx === 4 + empresas.length)
          );
          if (isEditableEmpCol) onPriceChange?.(targetRow, lines[r][c]);
        }
      }
    } catch {}
    setContextMenu(null);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) setContextMenu(null);
    };
    if (contextMenu) { document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler); }
  }, [contextMenu]);

  const handleHeaderSort = useCallback((colIdx: number, origIdx: number) => {
    if (origIdx === 0 || origIdx > 3 + empresas.length * 2 + 1) return;
    if (sortCol !== origIdx) { setSortCol(origIdx); setSortDir('asc'); return; }
    if (sortDir === 'asc') { setSortDir('desc'); return; }
    setSortCol(null);
  }, [sortCol, sortDir, empresas.length]);

  const allRows = useMemo(() => {
    const rows = [...produtos.map((p, i) => ({ prod: p, idx: i, isEmpty: false }))];
    for (let i = 0; i < fillerRows; i++) rows.push({ prod: null as any, idx: produtos.length + i, isEmpty: true });
    return rows;
  }, [produtos, fillerRows]);

  const orderedRows = useMemo(() =>
    rowOrder.length === allRows.length ? rowOrder.map(i => allRows[i]).filter(Boolean) : allRows,
    [rowOrder, allRows]
  );

  const sortedRows = useMemo(() => {
    if (sortCol === null) return orderedRows;
    const dataRows = orderedRows.filter(r => !r.isEmpty);
    const emptyRows = orderedRows.filter(r => r.isEmpty);
    dataRows.sort((a, b) => {
      if (!a.prod || !b.prod) return 0;
      let valA = '', valB = '';
      if (sortCol === 1) { valA = a.prod.codigo_interno; valB = b.prod.codigo_interno; }
      else if (sortCol === 2) { valA = a.prod.descricao; valB = b.prod.descricao; }
      else if (sortCol === 3) { valA = a.prod.codigo_barras; valB = b.prod.codigo_barras; }
      else {
        const sortColDef = allColDefs.find(c => c.originalIdx === sortCol);
        if (sortColDef?.state && sortColDef?.empresa) {
          const prA = getPreco(sortColDef.empresa, sortColDef.state, a.prod.codigo_interno);
          const prB = getPreco(sortColDef.empresa, sortColDef.state, b.prod.codigo_interno);
          return (sortDir === 'asc' ? 1 : -1) * (parsePrice(prA as string | number) - parsePrice(prB as string | number));
        }
      }
      const cmp = valA.localeCompare(valB, 'pt-BR', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return [...dataRows, ...emptyRows];
  }, [orderedRows, sortCol, sortDir, allColDefs, getPreco]);

  const getSelectionBorders = useCallback((row: number, col: number) => {
    const range = getSelectionRange();
    if (!range) return '';
    const selected = row >= range.minRow && row <= range.maxRow && col >= range.minCol && col <= range.maxCol;
    if (!selected) return '';
    const classes: string[] = [];
    if (row === range.minRow) classes.push('border-t-2 border-t-primary');
    if (row === range.maxRow) classes.push('border-b-2 border-b-primary');
    if (col === range.minCol) classes.push('border-l-2 border-l-primary');
    if (col === range.maxCol) classes.push('border-r-2 border-r-primary');
    return classes.join(' ');
  }, [getSelectionRange]);

  // Price markup state
  const [priceMarkups, setPriceMarkups] = useState<Record<string, number>>({});
  const [markupDialog, setMarkupDialog] = useState<{ empresa: string } | null>(null);
  const [markupValue, setMarkupValue] = useState('');
  const markupInputRef = useRef<HTMLInputElement>(null);

  // Add supplier column state
  const [showAddEmpresa, setShowAddEmpresa] = useState(false);
  const [newEmpresaName, setNewEmpresaName] = useState('');
  const [addEmpresaStep, setAddEmpresaStep] = useState<'name' | 'state'>('name');
  const addEmpresaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddEmpresa) {
      setAddEmpresaStep('name');
      setTimeout(() => addEmpresaInputRef.current?.focus(), 50);
    }
  }, [showAddEmpresa]);

  const handleAddEmpresa = async (states: string[]) => {
    const name = newEmpresaName.trim();
    if (!name || !onAddEmpresa || states.length === 0) return;
    if (empresas.includes(name)) {
      setShowAddEmpresa(false);
      setNewEmpresaName('');
      return;
    }
    await onAddEmpresa(name, states);
    setShowAddEmpresa(false);
    setNewEmpresaName('');
  };

  useEffect(() => {
    if (!listaId) return;
    const loadMarkups = async () => {
      const { data } = await supabase.from('price_markups').select('empresa, markup_percent').eq('lista_id', listaId).eq('user_id', user?.id ?? '');
      if (data && data.length > 0) {
        const loaded: Record<string, number> = {};
        data.forEach((row: any) => { loaded[row.empresa] = Number(row.markup_percent); });
        setPriceMarkups(loaded);
      }
    };
    loadMarkups();
  }, [listaId]);

  const saveMarkupToDb = async (empresa: string, percent: number) => {
    if (!listaId) return;
    if (percent === 0) await supabase.from('price_markups').delete().eq('lista_id', listaId).eq('empresa', empresa).eq('user_id', user?.id ?? '');
    else await supabase.from('price_markups').upsert({ lista_id: listaId, empresa, markup_percent: percent, updated_at: new Date().toISOString(), user_id: user?.id }, { onConflict: 'lista_id,empresa' });
  };

  // Tipo de preço definido manualmente por coluna (empresa + UF)
  const [tipoPrecoOverrides, setTipoPrecoOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!listaId) return;
    (async () => {
      const { data } = await supabase.from('price_types').select('empresa, estado, tipo').eq('lista_id', listaId).eq('user_id', user?.id ?? '');
      const loaded: Record<string, string> = {};
      (data ?? []).forEach((row: any) => { loaded[`${row.empresa}_${row.estado}`] = row.tipo; });
      setTipoPrecoOverrides(loaded);
    })();
  }, [listaId, user?.id]);

  const getTipoPreco = useCallback((empresa: string, state: string) =>
    tipoPrecoOverrides[`${empresa}_${state}`] ?? tipoPrecoMap[`${empresa}_${state}`] ?? (state === 'GO' ? 'NOTA' : 'IPI_ST'),
    [tipoPrecoOverrides, tipoPrecoMap]);

  const setTipoPreco = async (empresa: string, estado: string, tipo: string) => {
    pushUndo();
    setTipoPrecoOverrides(prev => ({ ...prev, [`${empresa}_${estado}`]: tipo }));
    setContextMenu(null);
    if (!listaId) return;
    await supabase.from('price_types').upsert(
      { lista_id: listaId, empresa, estado, tipo, user_id: user?.id, updated_at: new Date().toISOString() },
      { onConflict: 'lista_id,empresa,estado' }
    );
  };


  useEffect(() => { if (markupDialog) setTimeout(() => markupInputRef.current?.focus(), 50); }, [markupDialog]);

  const applyMarkup = () => {
    if (!markupDialog) return;
    const pct = parseFloat(markupValue.replace(',', '.'));
    if (isNaN(pct)) { setMarkupDialog(null); setMarkupValue(''); return; }
    pushUndo();
    const newVal = (priceMarkups[markupDialog.empresa] || 0) + pct;
    setPriceMarkups(prev => ({ ...prev, [markupDialog.empresa]: newVal }));
    saveMarkupToDb(markupDialog.empresa, newVal);
    setMarkupDialog(null); setMarkupValue('');
  };

  const getMarkedUpPrice = useCallback((rawPrice: number, empresa: string): number => {
    const markup = priceMarkups[empresa];
    if (!markup) return rawPrice;
    return rawPrice * (1 + markup / 100);
  }, [priceMarkups]);

  const getContextEmpresa = (): string | null => {
    if (!contextMenu || contextMenu.colIdx === undefined) return null;
    const colDef = orderedColDefs.find(c => c.orderIdx === contextMenu.colIdx);
    return colDef?.empresa || null;
  };

  const calcUndercutPrice = (competitorPrice: number): number => {
    const cents = Math.round(competitorPrice * 100);
    for (let c = cents - 1; c >= cents - 5; c--) {
      const lastDigit = c % 10;
      if (lastDigit === 5 || lastDigit === 7 || lastDigit === 9) return c / 100;
    }
    for (let c = cents - 6; c >= cents - 10; c--) {
      const lastDigit = c % 10;
      if (lastDigit === 5 || lastDigit === 7 || lastDigit === 9) return c / 100;
    }
    return (cents - 1) / 100;
  };

  const handleCobrirConcorrentes = useCallback(() => {
    if (!contextMenu || contextMenu.colIdx === undefined) return;
    const colDef = orderedColDefs.find(c => c.orderIdx === contextMenu.colIdx);
    if (!colDef?.empresa || !colDef?.state) { setContextMenu(null); return; }
    const emp = colDef.empresa;
    const state = colDef.state;
    const newEdits: Record<string, string> = {};
    let changed = 0;

    for (let rowIdx = 0; rowIdx < produtos.length; rowIdx++) {
      const prod = produtos[rowIdx];
      const rawSel = getPreco(emp, state, prod.codigo_interno);
      const selPrice = parsePrice(rawSel as string | number);
      if (selPrice === Infinity || selPrice <= 0) continue;

      // Find lowest competitor price
      let minConc = Infinity;
      for (const otherEmp of empresas) {
        if (otherEmp === emp) continue;
        const rawOther = getPreco(otherEmp, state, prod.codigo_interno);
        const otherPrice = parsePrice(rawOther as string | number);
        if (otherPrice > 0 && otherPrice < Infinity && otherPrice < minConc) {
          minConc = otherPrice;
        }
      }

      // Only undercut if supplier lost (their price > lowest competitor)
      if (minConc === Infinity || selPrice <= minConc) continue;

      const undercutPrice = calcUndercutPrice(minConc);
      if (undercutPrice > 0 && undercutPrice < selPrice) {
        // Find the originalIdx for this empresa+state column
        const matchCol = allColDefs.find(c => c.empresa === emp && c.state === state);
        if (matchCol) {
          const editKey = `${rowIdx}-${matchCol.originalIdx}`;
          newEdits[editKey] = undercutPrice.toFixed(2).replace('.', ',');
          changed++;
        }
      }
    }

    if (changed > 0) {
      pushUndo();
      setCellEdits(prev => ({ ...prev, ...newEdits }));
      setHasUnsavedChanges(true);
    }
    setContextMenu(null);
  }, [contextMenu, orderedColDefs, allColDefs, produtos, empresas, getPreco, pushUndo]);

  // Toolbar
  const getSelectionTarget = (): { type: 'cell'; keys: string[] } | null => {
    const range = getSelectionRange();
    if (!range) return null;
    const keys: string[] = [];
    for (let r = range.minRow; r <= range.maxRow; r++) {
      for (let c = range.minCol; c <= range.maxCol; c++) {
        const colDef = orderedColDefs[c];
        if (colDef) keys.push(`${r}-${colDef.orderIdx}`);
      }
    }
    return { type: 'cell', keys };
  };

  const toolbarToggleBold = () => {
    const target = getSelectionTarget(); if (!target) return;
    pushUndo();
    const allB = target.keys.every(k => cellBold[k]);
    setCellBold(prev => { const next = { ...prev }; target.keys.forEach(k => { next[k] = !allB; }); return next; });
  };
  const toolbarToggleItalic = () => {
    const target = getSelectionTarget(); if (!target) return;
    pushUndo();
    const allI = target.keys.every(k => cellItalic[k]);
    setCellItalic(prev => { const next = { ...prev }; target.keys.forEach(k => { next[k] = !allI; }); return next; });
  };
  const toolbarSetAlign = (align: TextAlign) => {
    const target = getSelectionTarget(); if (!target) return;
    pushUndo();
    setCellAligns(prev => { const next = { ...prev }; target.keys.forEach(k => { next[k] = align; }); return next; });
  };
  const toolbarSetBgColor = (color: string) => {
    const target = getSelectionTarget(); if (!target) return;
    pushUndo();
    setCellBgColor(prev => { const next = { ...prev }; target.keys.forEach(k => { next[k] = color; }); return next; });
  };

  // ===== Snapshot + desfazer =====
  snapshotFnRef.current = () => ({
    cellEdits, cellAligns, colAligns, rowAligns,
    cellBold, cellItalic, cellBgColor,
    colBold, colItalic, colBgColor,
    rowBold, rowItalic, rowBgColor,
    colOrder, rowOrder, colWidths, rowHeights,
    sortCol, sortDir, hasUnsavedChanges,
    produtos, priceMarkups, tipoPrecoOverrides,
  });

  const handleUndo = useCallback(() => {
    const snap = undoStackRef.current.pop();
    setUndoCount(undoStackRef.current.length);
    if (!snap) return;
    setCellEdits(snap.cellEdits);
    setCellAligns(snap.cellAligns); setColAligns(snap.colAligns); setRowAligns(snap.rowAligns);
    setCellBold(snap.cellBold); setCellItalic(snap.cellItalic); setCellBgColor(snap.cellBgColor);
    setColBold(snap.colBold); setColItalic(snap.colItalic); setColBgColor(snap.colBgColor);
    setRowBold(snap.rowBold); setRowItalic(snap.rowItalic); setRowBgColor(snap.rowBgColor);
    setColOrder(snap.colOrder); setRowOrder(snap.rowOrder);
    setColWidths(snap.colWidths); setRowHeights(snap.rowHeights);
    setSortCol(snap.sortCol); setSortDir(snap.sortDir);
    setHasUnsavedChanges(snap.hasUnsavedChanges);
    setEditingCell(null);

    // Acréscimo (markup) — restaura e persiste apenas o que mudou
    const prevMarkups: Record<string, number> = snap.priceMarkups || {};
    const curMarkups = priceMarkups;
    const empresasMarkup = new Set([...Object.keys(prevMarkups), ...Object.keys(curMarkups)]);
    let markupChanged = false;
    empresasMarkup.forEach(emp => {
      if ((prevMarkups[emp] ?? 0) !== (curMarkups[emp] ?? 0)) {
        markupChanged = true;
        saveMarkupToDb(emp, prevMarkups[emp] ?? 0);
      }
    });
    if (markupChanged) setPriceMarkups(prevMarkups);

    // Tipo de preço — restaura e persiste apenas o que mudou
    const prevTipos: Record<string, string> = snap.tipoPrecoOverrides || {};
    const curTipos = tipoPrecoOverrides;
    const chaves = new Set([...Object.keys(prevTipos), ...Object.keys(curTipos)]);
    let tipoChanged = false;
    chaves.forEach(k => {
      if (prevTipos[k] !== curTipos[k]) {
        tipoChanged = true;
        const [empresa, estado] = k.split('_');
        const tipo = prevTipos[k] ?? (estado === 'GO' ? 'NOTA' : 'IPI_ST');
        if (listaId) {
          supabase.from('price_types').upsert(
            { lista_id: listaId, empresa, estado, tipo, user_id: user?.id, updated_at: new Date().toISOString() },
            { onConflict: 'lista_id,empresa,estado' }
          ).then(() => {});
        }
      }
    });
    if (tipoChanged) setTipoPrecoOverrides(prevTipos);

    // Produtos (novo item / exclusão / etc.)
    if (onSave && JSON.stringify(snap.produtos) !== JSON.stringify(produtos)) {
      onSave(snap.produtos);
    }
  }, [priceMarkups, tipoPrecoOverrides, produtos, onSave, listaId, user?.id]);

  // Atalho Ctrl+Z / Cmd+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        handleUndo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleUndo]);

  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showColorPicker) return;
    const handler = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) setShowColorPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showColorPicker]);

  const hasSelection = activeCell !== null;
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    setColumnFilters({}); setFilterEditor(null); setSearchTerm(''); setReplaceTerm('');
    setFrozenRows(0); setFrozenCols(0); setSortCol(null);
  }, [listaId]);

  const findNext = useCallback(() => {
    const term = searchTerm.trim().toLocaleLowerCase('pt-BR');
    if (!term) return;
    const dataCols = orderedColDefs.map((col, index) => ({ col, index })).filter(item => item.col.isData);
    const cells = produtos.flatMap((_prod, row) => dataCols.map(item => ({ row, col: item.index })));
    const start = activeCell ? cells.findIndex(cell => cell.row === activeCell.row && cell.col === activeCell.col) + 1 : 0;
    for (let offset = 0; offset < cells.length; offset++) {
      const cell = cells[(start + offset) % cells.length];
      if (getCellValue(cell.row, cell.col).toLocaleLowerCase('pt-BR').includes(term)) {
        setActiveCell(cell); setSelectionAnchor(cell); setSelectionEnd(cell);
        tableRef.current?.querySelector(`[data-cell="${cell.row}-${cell.col}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
    }
  }, [searchTerm, orderedColDefs, produtos, activeCell, getCellValue]);

  const replaceMatches = useCallback((all: boolean) => {
    const term = searchTerm.trim();
    if (!term || readOnly) return;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(escaped, 'gi');
    const targets: CellPos[] = [];
    if (!all && activeCell && getCellValue(activeCell.row, activeCell.col).toLocaleLowerCase('pt-BR').includes(term.toLocaleLowerCase('pt-BR'))) targets.push(activeCell);
    if (all) {
      for (let row = 0; row < produtos.length; row++) for (let col = 1; col < orderedColDefs.length; col++) {
        if (orderedColDefs[col]?.isData && getCellValue(row, col).toLocaleLowerCase('pt-BR').includes(term.toLocaleLowerCase('pt-BR'))) targets.push({ row, col });
      }
    }
    if (targets.length === 0) { findNext(); return; }
    const range = { minRow: Math.min(...targets.map(t => t.row)), maxRow: Math.max(...targets.map(t => t.row)), minCol: Math.min(...targets.map(t => t.col)), maxCol: Math.max(...targets.map(t => t.col)) };
    if (!authorizeRangeEdit(range)) return;
    pushUndo();
    const edits: Record<string, string> = {};
    for (const target of targets) {
      const def = orderedColDefs[target.col];
      if (def?.isData) edits[`${target.row}-${def.originalIdx}`] = getCellValue(target.row, target.col).replace(matcher, replaceTerm);
    }
    setCellEdits(prev => ({ ...prev, ...edits }));
    setHasUnsavedChanges(true); setSaveStatus('idle');
    if (!all) findNext();
  }, [searchTerm, replaceTerm, readOnly, activeCell, getCellValue, orderedColDefs, produtos.length, findNext, authorizeRangeEdit, pushUndo]);

  // Render row
  const renderRow = useCallback((prod: Produto | null, idx: number, isEmpty: boolean, displayIdx: number) => {
    const lowestEmpByUf: Record<string, string | null> = {};
    const secondEmpByUf: Record<string, string | null> = {};
    if (prod) {
      for (const uf of ufs) {
        lowestEmpByUf[uf] = getLowestEmpresa(prod.codigo_interno, uf);
        secondEmpByUf[uf] = getSecondEmpresa(prod.codigo_interno, uf);
      }
    }
    const h = rowHeights[idx] || DEFAULT_ROW_HEIGHT;
    const isDragOver = dragOverRow === idx;

    return (
      <tr key={isEmpty ? `empty-${idx}` : idx} className={`group/row ${isDragOver ? 'border-t-2 border-t-primary' : ''}`}
        style={{ height: `${h}px`, ...(displayIdx < frozenRows ? { position: 'sticky', top: `${64 + displayIdx * DEFAULT_ROW_HEIGHT}px`, zIndex: 7 } : {}) }}>
        <td
          className="border-r border-b px-0 text-center text-[11px] text-muted-foreground select-none relative cursor-grab active:cursor-grabbing"
          style={{
            borderColor: 'hsl(var(--border))',
            backgroundColor: dragRow === idx ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--muted))',
            minWidth: getColWidth(0), width: getColWidth(0),
          }}
          draggable
          onDragStart={e => handleRowDragStart(e, idx)}
          onDragOver={e => handleRowDragOver(e, idx)}
          onDrop={e => handleRowDrop(e, idx)}
          onDragEnd={handleRowDragEnd}
          onContextMenu={e => handleContextMenu(e, 'row', undefined, idx)}
        >
          <div className="relative h-full w-full flex items-center justify-center group/idx">
            {prod ? displayIdx + 1 : (produtos.length > 0 ? displayIdx + 1 : '')}
            {!readOnly && prod && (
              <button 
                onClick={(e) => { e.stopPropagation(); deleteRow(idx); }}
                className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/idx:opacity-100 text-red-500 hover:text-red-700 bg-white/80 rounded shadow-sm p-0.5 transition-opacity"
                title="Excluir Produto"
              >
                <Trash className="w-3 h-3" />
              </button>
            )}
          </div>
          <div
            className={`absolute left-0 right-0 bottom-[-2px] h-[5px] cursor-row-resize z-30 ${activeRowResize === idx ? 'bg-primary' : 'hover:bg-primary/40'}`}
            style={{ opacity: activeRowResize === idx ? 1 : undefined }}
            onMouseDown={e => handleRowResizeStart(e, idx)}
            onDoubleClick={() => handleRowAutoFit(idx)}
          />
        </td>

        {orderedColDefs.slice(1).map((col, renderIdx) => {
          const colIdx = col.orderIdx;
          const visualColIdx = renderIdx + 1;
          const effectiveAlign = getCellAlign(colIdx, idx, col.defaultAlign);
          const selected = isCellSelected(idx, visualColIdx);
          const active = isCellActive(idx, visualColIdx);
          const selBorders = getSelectionBorders(idx, visualColIdx);
          const fmt = getCellFormatting(colIdx, idx);

          const cellBaseClass = `border-r border-b px-2 ${alignClass(effectiveAlign)} ${fmt.bold ? 'font-bold' : ''} ${fmt.italic ? 'italic' : ''} ${selected && !active ? 'bg-primary/10' : ''} ${active ? 'outline outline-2 outline-primary outline-offset-[-2px]' : ''} ${selBorders}`;
          const cellBgStyle = fmt.bgColor && !selected ? { backgroundColor: fmt.bgColor } : {};
          const isEditing = editingCell?.row === idx && editingCell?.col === visualColIdx;

          const cellEvents = {
            onClick: (e: React.MouseEvent) => handleCellClick(idx, visualColIdx, e),
            onMouseDown: (e: React.MouseEvent) => handleCellMouseDown(idx, visualColIdx, e),
            onMouseEnter: () => handleCellMouseEnter(idx, visualColIdx),
            onContextMenu: (e: React.MouseEvent) => handleContextMenu(e, 'cell', colIdx, idx),
            'data-cell': `${idx}-${visualColIdx}`,
          };

          if (isEmpty) {
            return (
              <td key={col.key} className={`${cellBaseClass} ${col.sticky ? 'sticky left-[36px] bg-background z-[5]' : ''}`}
                style={{ borderColor: 'hsl(var(--border))', minWidth: getColWidth(visualColIdx), width: getColWidth(visualColIdx), ...cellBgStyle }}
                {...cellEvents}>&nbsp;</td>
            );
          }

          const origIdx = col.originalIdx;
          if (origIdx >= 1 && origIdx <= 3) {
            const displayVal = computeDisplayValue(idx, origIdx);
            const stickyClass = origIdx === 1 ? 'sticky left-[36px] bg-background z-[5]' : '';
            const extraClass = origIdx === 2 ? 'overflow-hidden text-ellipsis' : '';
            const frozenStyle = visualColIdx <= frozenCols ? { position: 'sticky' as const, left: `${getFrozenLeft(visualColIdx)}px`, zIndex: displayIdx < frozenRows ? 9 : 6, backgroundColor: 'hsl(var(--background))' } : {};
            return (
              <td key={col.key} className={`${cellBaseClass} ${stickyClass} whitespace-nowrap ${extraClass} text-xs`}
                style={{ borderColor: 'hsl(var(--border))', minWidth: getColWidth(visualColIdx), width: getColWidth(visualColIdx), ...cellBgStyle, ...frozenStyle }}
                {...cellEvents} onDoubleClick={() => handleCellDoubleClick(idx, visualColIdx, origIdx)}>
                {isEditing ? (
                  <input ref={editInputRef} type="text" className={`w-full bg-transparent outline-none focus:ring-1 focus:ring-primary rounded px-1 ${alignClass(effectiveAlign)} text-xs h-full`}
                    value={editingValue} onChange={e => setEditingValue(e.target.value)}
                    onBlur={() => commitEdit(origIdx)} onKeyDown={e => { if (e.key === 'Enter') commitEdit(origIdx); if (e.key === 'Escape') cancelEdit(); }} />
                ) : displayVal}
              </td>
            );
          }

          if (col.isSeparator) {
            return <td key={col.key} className="border-r border-b bg-muted/30" style={{ borderColor: 'hsl(var(--border))', width: '8px', minWidth: '8px', maxWidth: '8px' }}>&nbsp;</td>;
          }

          if (col.state && col.empresa) {
            const emp = col.empresa;
            const state = col.state;
            const lowestEmp = lowestEmpByUf[state] ?? null;
            const isLowest = lowestEmp === emp;
            const isSecond = !isLowest && (secondEmpByUf[state] ?? null) === emp;
            const editKey = `${idx}-${origIdx}`;
            const hasEdit = cellEdits[editKey] !== undefined;
            const frozenStyle = visualColIdx <= frozenCols ? { position: 'sticky' as const, left: `${getFrozenLeft(visualColIdx)}px`, zIndex: displayIdx < frozenRows ? 9 : 6, backgroundColor: 'hsl(var(--background))' } : {};
            return (
              <td key={col.key} className={`${cellBaseClass} px-1 whitespace-nowrap text-xs ${isLowest ? 'bg-success/10 text-success font-bold' : isSecond ? 'bg-warning/25 text-warning-foreground font-bold' : ''}`}
                style={{ borderColor: 'hsl(var(--border))', minWidth: getColWidth(visualColIdx), width: getColWidth(visualColIdx), ...cellBgStyle, ...frozenStyle }}
                {...cellEvents} onDoubleClick={() => handleCellDoubleClick(idx, visualColIdx, origIdx)}>
                {isEditing ? (
                  <input ref={editInputRef} type="text" inputMode="decimal" className={`w-full bg-transparent outline-none focus:ring-1 focus:ring-primary rounded px-1 ${alignClass(effectiveAlign)} text-xs h-full`}
                    value={editingValue} onChange={e => setEditingValue(e.target.value)}
                    onBlur={() => commitEdit(origIdx)} onKeyDown={e => { if (e.key === 'Enter') commitEdit(origIdx); if (e.key === 'Escape') cancelEdit(); }} placeholder="0,00" />
                ) : (() => {
                  if (hasEdit) {
                    const rawEdit = cellEdits[editKey];
                    const editVal = isFormula(rawEdit) ? evalRaw(rawEdit, editKey) : rawEdit;
                    if (!editVal || editVal === '') return 'R$ -';
                    if (isFormulaError(editVal)) return editVal;
                    const num = parsePrice(editVal);
                    return num === Infinity ? editVal : `R$ ${Number(num).toFixed(2).replace('.', ',')}`;
                  }
                  const raw = getPreco(emp, state, prod!.codigo_interno);
                  if (raw === '' || raw === undefined || raw === null) return 'R$ -';
                  const num = parsePrice(raw as string | number);
                  if (num === Infinity) return raw;
                  const finalPrice = getMarkedUpPrice(num, emp);
                  return `R$ ${Number(finalPrice).toFixed(2).replace('.', ',')}`;
                })()}
              </td>
            );
          }

          return <td key={col.key} className={cellBaseClass} style={{ borderColor: 'hsl(var(--border))', ...cellBgStyle }} {...cellEvents}>&nbsp;</td>;
        })}
      </tr>
    );
  }, [orderedColDefs, getColWidth, getFrozenLeft, getLowestEmpresa, getSecondEmpresa, editingCell, editingValue, cellEdits, getPreco, getMarkedUpPrice,
      isCellSelected, isCellActive, getSelectionBorders, editableColumn, editPrices, readOnly, rowHeights,
      dragOverRow, dragRow, activeRowResize, produtos, computeDisplayValue, evalRaw, handleCellClick, handleCellMouseDown,
      handleCellMouseEnter, handleCellDoubleClick, commitEdit, cancelEdit, onPriceChange, ufs, frozenRows, frozenCols]);

  // Filtered rows
  const displayRows = useMemo(() => {
    let rows = sortedRows;
    if (winnerFilter) {
      rows = rows.filter(row => {
        if (row.isEmpty || !row.prod) return false;
        return getLowestEmpresa(row.prod.codigo_interno, winnerFilter.state) === winnerFilter.empresa;
      });
    }
    const activeFilters = Object.entries(columnFilters).filter(([, filter]) => filter.text || filter.min || filter.max || filter.emptyOnly || filter.winnerOnly);
    if (activeFilters.length === 0) return rows;
    return rows.filter(row => {
      if (row.isEmpty || !row.prod) return false;
      return activeFilters.every(([origIdxText, filter]) => {
        const origIdx = Number(origIdxText);
        const visualCol = orderedColDefs.findIndex(col => col.originalIdx === origIdx);
        if (visualCol < 0) return true;
        const rawValue = getCellValue(row.idx, visualCol);
        const value = isFormula(rawValue)
          ? evalRaw(rawValue, `${row.idx}-${orderedColDefs[visualCol]?.originalIdx ?? visualCol}`)
          : rawValue;
        const empty = value.trim() === '' || value === 'R$ -';
        if (filter.emptyOnly && !empty) return false;
        if (filter.text && !value.toLocaleLowerCase('pt-BR').includes(filter.text.toLocaleLowerCase('pt-BR'))) return false;
        const col = orderedColDefs[visualCol];
        if (filter.winnerOnly && (!col.empresa || !col.state || getLowestEmpresa(row.prod.codigo_interno, col.state) !== col.empresa)) return false;
        const numeric = parsePrice(value);
        const min = filter.min ? parsePrice(filter.min) : -Infinity;
        const max = filter.max ? parsePrice(filter.max) : Infinity;
        if (filter.min && (numeric === Infinity || numeric < min)) return false;
        if (filter.max && (numeric === Infinity || numeric > max)) return false;
        return true;
      });
    });
  }, [sortedRows, winnerFilter, getLowestEmpresa, columnFilters, orderedColDefs, getCellValue, evalRaw]);


  return (
    <div className="flex-1 flex flex-col" style={{ border: '1px solid hsl(var(--border))' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/50 flex-wrap" style={{ borderColor: 'hsl(var(--border))' }}>
        <Button variant="ghost" size="sm" onClick={handleUndo} disabled={undoCount === 0}
          className="h-7 px-2 text-xs" title="Desfazer última alteração (Ctrl+Z)">
          <Undo2 className="w-4 h-4" /><span className="hidden sm:inline">Desfazer</span>
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        {!readOnly && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => document.execCommand('cut')} disabled={!hasSelection} title="Recortar (Ctrl+X)"><Scissors className="w-4 h-4" /></Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={duplicateSelection} disabled={!hasSelection} title="Duplicar seleção abaixo"><Copy className="w-4 h-4" /><span className="hidden md:inline">Duplicar</span></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearSelection} disabled={!hasSelection} title="Limpar conteúdo"><Eraser className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fillDown} disabled={!hasSelection} title="Preencher para baixo"><Rows3 className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fillRight} disabled={!hasSelection} title="Preencher para a direita"><Columns3 className="w-4 h-4" /></Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={applyFormulaValueToSelection} disabled={!hasSelection} title="Aplicar o conteúdo da barra ao intervalo">Aplicar</Button>
            <div className="w-px h-5 bg-border mx-1" />
          </>
        )}
        {!readOnly && (
          <>
            <button onClick={addRow}
              className="p-1.5 rounded hover:bg-accent transition-colors flex items-center gap-1 text-xs text-blue-600 font-bold" title="Adicionar Novo Produto">
              <Plus className="w-4 h-4" /><span>Novo Item</span>
            </button>
            <div className="w-px h-5 bg-border mx-1" />
          </>
        )}
        <button onClick={toolbarToggleBold} disabled={!hasSelection} className="p-1.5 rounded hover:bg-accent disabled:opacity-40 transition-colors" title="Negrito">
          <Bold className="w-4 h-4" />
        </button>
        <button onClick={toolbarToggleItalic} disabled={!hasSelection} className="p-1.5 rounded hover:bg-accent disabled:opacity-40 transition-colors" title="Itálico">
          <Italic className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <button onClick={() => toolbarSetAlign('left')} disabled={!hasSelection} className="p-1.5 rounded hover:bg-accent disabled:opacity-40 transition-colors" title="Alinhar à Esquerda">
          <AlignLeft className="w-4 h-4" />
        </button>
        <button onClick={() => toolbarSetAlign('center')} disabled={!hasSelection} className="p-1.5 rounded hover:bg-accent disabled:opacity-40 transition-colors" title="Centralizar">
          <AlignCenter className="w-4 h-4" />
        </button>
        <button onClick={() => toolbarSetAlign('right')} disabled={!hasSelection} className="p-1.5 rounded hover:bg-accent disabled:opacity-40 transition-colors" title="Alinhar à Direita">
          <AlignRight className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <div className="relative">
          <button onClick={() => setShowColorPicker(!showColorPicker)} disabled={!hasSelection} className="p-1.5 rounded hover:bg-accent disabled:opacity-40 transition-colors flex items-center gap-1" title="Cor de Fundo">
            <Paintbrush className="w-4 h-4" />
          </button>
          {showColorPicker && (
            <div ref={colorPickerRef} className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-lg p-2 z-50 flex gap-1 flex-wrap w-[140px]">
              {BG_COLORS.map(c => (
                <button key={c.value} onClick={() => { toolbarSetBgColor(c.value); setShowColorPicker(false); }}
                  className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform" style={{ backgroundColor: c.value }} title={c.label} />
              ))}
              <button onClick={() => { toolbarSetBgColor(''); setShowColorPicker(false); }}
                className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform flex items-center justify-center bg-background" title="Remover cor">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>

        <Button variant={showSearch ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setShowSearch(value => !value)} title="Localizar e substituir"><Search className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAutoFitAll} title="Ajustar automaticamente largura e altura"><Scaling className="w-4 h-4" /></Button>
        <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5 bg-background" title="Congelar linhas e colunas">
          <Snowflake className="w-3.5 h-3.5 mx-1 text-muted-foreground" />
          <Button variant={frozenRows ? 'secondary' : 'ghost'} size="sm" className="h-6 px-2 text-[10px]" onClick={() => setFrozenRows(value => value ? 0 : 1)}>Linha</Button>
          <Button variant={frozenCols ? 'secondary' : 'ghost'} size="sm" className="h-6 px-2 text-[10px]" onClick={() => setFrozenCols(value => value ? 0 : Math.min(3, orderedColDefs.length - 1))}>Colunas</Button>
        </div>

        {onSave && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <button onClick={() => void handleSave(false)} disabled={!hasUnsavedChanges || saveStatus === 'saving'}
              className={`p-1.5 rounded transition-colors flex items-center gap-1 text-xs ${hasUnsavedChanges ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'hover:bg-accent disabled:opacity-40'}`}
              title="Salvar alterações">
              <Save className="w-4 h-4" /><span className="hidden sm:inline">Salvar</span>
            </button>
            <span className={`ml-1 inline-flex items-center gap-1 text-[10px] font-medium ${saveStatus === 'error' ? 'text-destructive' : saveStatus === 'saved' ? 'text-success' : 'text-muted-foreground'}`}>
              {saveStatus === 'saving' ? <><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</> :
               saveStatus === 'saved' ? <><CheckCircle2 className="w-3 h-3" /> Salvo</> :
               saveStatus === 'error' ? <><AlertCircle className="w-3 h-3" /> Erro ao salvar</> :
               hasUnsavedChanges ? 'Alterações pendentes' : null}
            </span>
          </>
        )}

        {/* State Filter Toggle */}
        {empresas.length > 0 && ufs.length > 0 && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <div className="flex items-center gap-0.5 bg-background border border-border rounded-md p-0.5">
              {ufs.map(uf => (
                <button
                  key={uf}
                  onClick={() => setStateFilter(uf)}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                    stateFilter === uf ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {uf}
                </button>
              ))}
              <button
                onClick={() => setStateFilter(ALL_STATES)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                  stateFilter === ALL_STATES ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                Todos
              </button>
            </div>
          </>
        )}

        {/* Add Supplier */}
        {onAddEmpresa && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <button onClick={() => setShowAddEmpresa(true)}
              className="p-1.5 rounded hover:bg-accent transition-colors flex items-center gap-1 text-xs" title="Adicionar Fornecedor">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">Fornecedor</span>
            </button>
          </>
        )}

        {/* Segundo menor preço */}
        <div className="w-px h-5 bg-border mx-1" />
        <button onClick={() => setHighlightSecond(v => !v)}
          className={`p-1.5 rounded transition-colors flex items-center gap-1 text-xs ${highlightSecond ? 'bg-warning/25 text-warning-foreground font-bold' : 'hover:bg-accent'}`}
          title="Destacar o segundo menor preço de cada item">
          <span className="w-3 h-3 rounded-sm bg-warning inline-block" />
          <span className="hidden sm:inline">Ganhador secundário</span>
        </button>

        {winnerFilter && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <button onClick={() => setWinnerFilter(null)}
              className="px-2 py-1 rounded bg-success/15 text-success text-[10px] font-bold flex items-center gap-1"
              title="Remover filtro">
              <Filter className="w-3 h-3" /> Ganhos: {winnerFilter.empresa} ({winnerFilter.state})
              <X className="w-3 h-3" />
            </button>
          </>
        )}
      </div>

      {showSearch && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-background" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="relative min-w-44 flex-1 max-w-xs"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} onKeyDown={event => event.key === 'Enter' && findNext()} className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-primary" placeholder="Localizar" autoFocus /></div>
          <input value={replaceTerm} onChange={event => setReplaceTerm(event.target.value)} className="h-8 min-w-44 flex-1 max-w-xs rounded-md border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-primary" placeholder="Substituir por" />
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={findNext}>Próximo</Button>
          {!readOnly && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => replaceMatches(false)}>Substituir</Button>}
          {!readOnly && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => replaceMatches(true)}>Substituir todos</Button>}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSearch(false)} title="Fechar"><X className="w-4 h-4" /></Button>
        </div>
      )}

      <div className="flex items-center min-h-8 border-b bg-background" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="w-16 shrink-0 self-stretch border-r flex items-center justify-center text-[11px] font-bold text-muted-foreground bg-muted/40">
          {activeCell ? `${spreadsheetColumnName(activeCell.col)}${activeCell.row + 1}` : '—'}
        </div>
        <div className="w-10 shrink-0 self-stretch border-r flex items-center justify-center font-display font-bold text-sm text-muted-foreground" title="Barra de conteúdo">fx</div>
        <input
          value={formulaValue}
          onChange={e => setFormulaValue(e.target.value)}
          onBlur={commitFormulaBar}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitFormulaBar(); containerRef.current?.focus(); }
            if (e.key === 'Escape') { setFormulaValue(activeCell ? getCellValue(activeCell.row, activeCell.col) : ''); containerRef.current?.focus(); }
          }}
          disabled={!activeCell || readOnly}
          className="h-8 min-w-0 flex-1 bg-background px-3 text-xs outline-none focus:ring-1 focus:ring-inset focus:ring-primary disabled:opacity-60"
          aria-label="Conteúdo da célula selecionada"
          placeholder="Digite um valor ou uma fórmula, ex.: =SOMA(D1:D10)"
        />
      </div>

      {/* Spreadsheet */}
      <div ref={containerRef} className="flex-1 overflow-auto relative" tabIndex={0}>
        <table ref={tableRef} className="border-collapse text-sm"
          style={{ tableLayout: 'fixed', fontFamily: 'var(--font-body)', fontSize: '12px' }}>
          <colgroup>
            {orderedColDefs.map((col, i) => {
              if (col.isSeparator) return <col key={col.key} style={{ width: '8px' }} />;
              return <col key={col.key} style={{ width: `${getColWidth(i)}px` }} />;
            })}
          </colgroup>

          <thead className="sticky top-0 z-10">
            <tr className="h-6 bg-muted/70">
              {orderedColDefs.map((col, i) => (
                <th key={`letter-${col.key}`} className={`border-r border-b text-[10px] font-semibold text-muted-foreground select-none ${i === 0 ? 'sticky left-0 z-30 bg-muted' : ''}`}
                  style={{ borderColor: 'hsl(var(--border))', minWidth: getColWidth(i), width: getColWidth(i) }}>
                  {i === 0 ? '' : spreadsheetColumnName(i)}
                </th>
              ))}
            </tr>
            <tr style={{ height: `${HEADER_HEIGHT}px` }}>
              {orderedColDefs.map((col, i) => {
                const colIdx = col.orderIdx;
                const isDragOverCol = dragOverCol === colIdx;
                if (col.isSeparator) {
                  return <th key={col.key} className="border-r border-b bg-muted/30"
                    style={{ borderColor: 'hsl(var(--border))', width: '8px', minWidth: '8px', maxWidth: '8px', height: HEADER_HEIGHT }} />;
                }
                return (
                  <th key={col.key}
                    className={`border-r border-b px-2 font-semibold whitespace-nowrap relative select-none text-[11px] ${
                      getCellAlign(colIdx, -1, col.defaultAlign) === 'left' ? 'text-left' : getCellAlign(colIdx, -1, col.defaultAlign) === 'right' ? 'text-right' : 'text-center'
                    } ${col.sticky ? 'sticky left-[36px] z-20' : ''} ${
                      col.highlight ? 'bg-primary text-primary-foreground' : 'text-foreground'
                    } ${isDragOverCol ? 'border-l-2 border-l-primary' : ''}`}
                    style={{
                      borderColor: 'hsl(var(--border))',
                      backgroundColor: col.highlight ? undefined : dragCol === colIdx ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--muted))',
                      height: HEADER_HEIGHT,
                      cursor: i > 0 && !col.isSeparator ? 'grab' : 'default',
                      ...(i <= frozenCols ? { position: 'sticky', left: `${getFrozenLeft(i)}px`, zIndex: 24 } : {}),
                    }}
                    draggable={i > 0 && !col.isSeparator}
                    onDragStart={e => handleColDragStart(e, colIdx)}
                    onDragOver={e => handleColDragOver(e, colIdx)}
                    onDrop={e => handleColDrop(e, colIdx)}
                    onDragEnd={handleColDragEnd}
                    onContextMenu={e => handleContextMenu(e, 'column', colIdx)}
                    onClick={() => i > 0 && handleHeaderSort(colIdx, col.originalIdx)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortCol === col.originalIdx && <span className="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </span>
                    {col.isData && (
                      <Button variant="ghost" size="icon" className={`absolute left-0.5 top-0.5 h-5 w-5 ${columnFilters[col.originalIdx] ? 'text-primary' : 'text-muted-foreground'}`}
                        onClick={event => { event.stopPropagation(); setFilterDraft(columnFilters[col.originalIdx] ?? {}); setFilterEditor(filterEditor === col.originalIdx ? null : col.originalIdx); }} title="Filtrar coluna">
                        <Filter className="w-3 h-3" />
                      </Button>
                    )}
                    {filterEditor === col.originalIdx && (
                      <div className="absolute left-0 top-full z-50 w-60 border border-border bg-popover p-3 shadow-xl rounded-md text-left" onClick={event => event.stopPropagation()}>
                        <div className="text-[11px] font-bold mb-2">Filtrar {col.label}</div>
                        <input value={filterDraft.text ?? ''} onChange={event => setFilterDraft(value => ({ ...value, text: event.target.value }))} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs mb-2" placeholder="Texto contém" />
                        {col.empresa && <div className="grid grid-cols-2 gap-2 mb-2"><input value={filterDraft.min ?? ''} onChange={event => setFilterDraft(value => ({ ...value, min: event.target.value }))} className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-0" placeholder="Preço mín." /><input value={filterDraft.max ?? ''} onChange={event => setFilterDraft(value => ({ ...value, max: event.target.value }))} className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-0" placeholder="Preço máx." /></div>}
                        <label className="flex items-center gap-2 py-1 text-xs font-normal"><input type="checkbox" checked={Boolean(filterDraft.emptyOnly)} onChange={event => setFilterDraft(value => ({ ...value, emptyOnly: event.target.checked }))} /> Somente vazias</label>
                        {col.empresa && <label className="flex items-center gap-2 py-1 text-xs font-normal"><input type="checkbox" checked={Boolean(filterDraft.winnerOnly)} onChange={event => setFilterDraft(value => ({ ...value, winnerOnly: event.target.checked }))} /> Somente vencedores</label>}
                        <div className="flex justify-end gap-2 mt-3"><Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setColumnFilters(filters => { const next = { ...filters }; delete next[col.originalIdx]; return next; }); setFilterEditor(null); }}>Limpar</Button><Button size="sm" className="h-7 text-xs" onClick={() => { setColumnFilters(filters => ({ ...filters, [col.originalIdx]: filterDraft })); setFilterEditor(null); }}>Aplicar</Button></div>
                      </div>
                    )}
                    {col.empresa && priceMarkups[col.empresa] ? (
                      <span className="ml-1 text-[9px] opacity-70">(+{priceMarkups[col.empresa].toFixed(1)}%)</span>
                    ) : null}
                    {col.empresa && col.state ? (
                      <div className="text-[8px] leading-tight font-bold opacity-80 uppercase tracking-wide">
                        {tipoPrecoLabel(getTipoPreco(col.empresa, col.state))}
                        {' · '}
                        {tipoPrecoMap[`${col.empresa}_${col.state}_FRETE`] ?? 'CIF'}
                      </div>
                    ) : null}
                    {col.empresa && respostaDates[col.empresa] ? (
                      <div className="text-[8px] leading-tight font-normal opacity-70 normal-case tracking-normal">
                        {respostaDates[col.empresa]}
                      </div>
                    ) : null}

                    <div
                      className={`absolute top-0 bottom-0 w-[4px] cursor-col-resize z-30 ${activeColResize === i ? 'bg-primary' : 'hover:bg-primary/50'}`}
                      style={{ right: '-2px' }}
                      onMouseDown={e => handleColResizeStart(e, i)}
                      onDoubleClick={() => handleColAutoFit(i)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {displayRows.map((row, displayIdx) => renderRow(row.prod, row.idx, row.isEmpty, displayIdx))}
          </tbody>
        </table>

        {/* Context Menu */}
        {contextMenu && (
          <div ref={contextMenuRef} className="fixed bg-popover border border-border rounded-lg shadow-lg py-1 z-50 min-w-[180px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button onClick={handleCopyFromMenu} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
              <Copy className="w-3.5 h-3.5" /> Copiar (Ctrl+C)
            </button>
            {!readOnly && (
              <button onClick={handlePasteFromMenu} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                <ClipboardPaste className="w-3.5 h-3.5" /> Colar (Ctrl+V)
              </button>
            )}
            <div className="border-t border-border my-1" />
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Alinhamento {contextMenu.type === 'column' ? 'da Coluna' : contextMenu.type === 'row' ? 'da Linha' : 'da Célula'}
            </div>
            <button onClick={() => setAlignment('left')} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
              <AlignLeft className="w-3.5 h-3.5" /> Alinhar à Esquerda
            </button>
            <button onClick={() => setAlignment('center')} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
              <AlignCenter className="w-3.5 h-3.5" /> Centralizar
            </button>
            <button onClick={() => setAlignment('right')} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
              <AlignRight className="w-3.5 h-3.5" /> Alinhar à Direita
            </button>
            <div className="border-t border-border my-1" />
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Formatação</div>
            <button onClick={toggleBold} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
              <Bold className="w-3.5 h-3.5" /> Negrito
            </button>
            <button onClick={toggleItalic} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
              <Italic className="w-3.5 h-3.5" /> Itálico
            </button>
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">Cor de Fundo</div>
            <div className="flex gap-1 px-3 py-1 flex-wrap">
              {BG_COLORS.map(c => (
                <button key={c.value} onClick={() => setBgColor(c.value)}
                  className="w-5 h-5 rounded border border-border hover:scale-110 transition-transform" style={{ backgroundColor: c.value }} title={c.label} />
              ))}
              <button onClick={() => setBgColor('')} className="w-5 h-5 rounded border border-border hover:scale-110 transition-transform flex items-center justify-center bg-background" title="Remover cor">
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
            <div className="border-t border-border my-1" />

            {(() => {
              const emp = getContextEmpresa();
              if (!emp) return null;
              return (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Preços</div>
                  <button onClick={() => { setMarkupDialog({ empresa: emp }); setMarkupValue(''); setContextMenu(null); }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                    <Percent className="w-3.5 h-3.5" /> Acrescentar %
                    {priceMarkups[emp] ? <span className="ml-auto text-[10px] text-muted-foreground">({priceMarkups[emp] > 0 ? '+' : ''}{priceMarkups[emp].toFixed(1)}%)</span> : null}
                  </button>
                  {priceMarkups[emp] ? (
                    <button onClick={() => { setPriceMarkups(prev => { const next = { ...prev }; delete next[emp]; return next; }); saveMarkupToDb(emp, 0); setContextMenu(null); }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-destructive">
                      <X className="w-3.5 h-3.5" /> Remover acréscimo
                    </button>
                  ) : null}
                  <button onClick={handleCobrirConcorrentes}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                    <Swords className="w-3.5 h-3.5" /> Cobrir concorrentes
                  </button>
                  {(() => {
                    const cd = orderedColDefs.find(c => c.orderIdx === contextMenu.colIdx);
                    const st = cd?.state as string | undefined;
                    if (!st) return null;
                    const atual = getTipoPreco(emp, st);
                    return (
                      <>
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tipo de preço ({st})</div>
                        {(['IPI_ST', 'NOTA'] as const).map(t => (
                          <button key={t} onClick={() => setTipoPreco(emp, st, t)}
                            className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors ${atual === t ? 'font-bold text-primary' : 'text-foreground'}`}>
                            <Check className={`w-3.5 h-3.5 ${atual === t ? 'opacity-100' : 'opacity-0'}`} /> {tipoPrecoLabel(t)}
                          </button>
                        ))}
                      </>
                    );
                  })()}

                  {(() => {
                    const cd = orderedColDefs.find(c => c.orderIdx === contextMenu.colIdx);
                    const st = cd?.state as string | undefined;
                    if (!st) return null;
                    const isActive = winnerFilter?.empresa === emp && winnerFilter?.state === st;
                    return (
                      <button onClick={() => { setWinnerFilter(isActive ? null : { empresa: emp, state: st }); setContextMenu(null); }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                        <Filter className="w-3.5 h-3.5" /> {isActive ? 'Remover filtro de ganhos' : `Filtrar itens ganhos (${st})`}
                      </button>
                    );
                  })()}

                  <div className="border-t border-border my-1" />
                </>
              );
            })()}

            {(contextMenu.type === 'column' || contextMenu.type === 'cell') && contextMenu.colIdx !== undefined && contextMenu.colIdx > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Coluna</div>
                <button onClick={() => moveColumn('left')} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                  <ArrowLeft className="w-3.5 h-3.5" /> Mover para Esquerda
                </button>
                <button onClick={() => moveColumn('right')} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                  <ArrowRight className="w-3.5 h-3.5" /> Mover para Direita
                </button>
                {(() => {
                  const colDef = orderedColDefs.find(c => c.orderIdx === contextMenu.colIdx);
                  if (colDef && colDef.empresa && colDef.isData && colDef.key !== 'cod_int' && colDef.key !== 'desc' && colDef.key !== 'cod_bar') {
                    return (
                      <button
                        onClick={async () => {
                          if (onDeleteResposta && colDef.empresa) {
                            if (window.confirm(`Excluir permanentemente os dados de "${colDef.empresa}"?`)) {
                              await onDeleteResposta(colDef.empresa);
                            }
                          }
                          setContextMenu(null);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Excluir Coluna
                      </button>
                    );
                  }
                  return null;
                })()}
              </>
            )}

            {(contextMenu.type === 'row' || contextMenu.type === 'cell') && contextMenu.rowIdx !== undefined && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Mover Linha</div>
                <button onClick={() => moveRow('up')} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                  <ArrowUp className="w-3.5 h-3.5" /> Mover para Cima
                </button>
                <button onClick={() => moveRow('down')} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                  <ArrowDown className="w-3.5 h-3.5" /> Mover para Baixo
                </button>
              </>
            )}
          </div>
        )}

        {/* Markup Dialog */}
        {markupDialog && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onClick={() => setMarkupDialog(null)}>
            <div className="bg-popover border border-border rounded-lg shadow-xl p-4 w-72" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-foreground mb-1">Acrescentar %</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Fornecedor: <span className="font-bold text-foreground">{markupDialog.empresa}</span>
                {priceMarkups[markupDialog.empresa] ? <span className="ml-1">(acréscimo atual: {priceMarkups[markupDialog.empresa]}%)</span> : null}
              </p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input ref={markupInputRef} type="text" inputMode="decimal"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={markupValue} onChange={e => setMarkupValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') applyMarkup(); if (e.key === 'Escape') setMarkupDialog(null); }}
                    placeholder="Ex: 10" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
                <button onClick={applyMarkup} className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors">
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Empresa Dialog */}
        {showAddEmpresa && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onClick={() => setShowAddEmpresa(false)}>
            <div className="bg-popover border border-border rounded-lg shadow-xl p-4 w-80" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-foreground mb-1">Adicionar Fornecedor</h3>
              {addEmpresaStep === 'name' ? (
                <>
                  <p className="text-xs text-muted-foreground mb-3">
                    Digite o nome do fornecedor para criar uma nova coluna na planilha.
                  </p>
                  <div className="flex items-center gap-2">
                    <input ref={addEmpresaInputRef} type="text"
                      className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      value={newEmpresaName} onChange={e => setNewEmpresaName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newEmpresaName.trim()) setAddEmpresaStep('state');
                        if (e.key === 'Escape') setShowAddEmpresa(false);
                      }}
                      placeholder="Nome do fornecedor" />
                    <button onClick={() => setAddEmpresaStep('state')} disabled={!newEmpresaName.trim()}
                      className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50">
                      Próximo
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-3">
                    Em qual estado deseja adicionar a coluna para <span className="font-bold text-foreground">{newEmpresaName.trim()}</span>?
                  </p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {userEstados.map(uf => (
                      <button key={uf} onClick={() => handleAddEmpresa([uf])}
                        className="h-10 rounded-md border border-input bg-background hover:bg-accent text-sm font-bold transition-colors">
                        {uf}
                      </button>
                    ))}
                    {userEstados.length > 1 && (
                      <button onClick={() => handleAddEmpresa(userEstados)}
                        className="h-10 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-bold transition-colors">
                        Todos
                      </button>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => setAddEmpresaStep('name')}
                      className="h-8 px-3 rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors">
                      ← Voltar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpreadsheetTable;
