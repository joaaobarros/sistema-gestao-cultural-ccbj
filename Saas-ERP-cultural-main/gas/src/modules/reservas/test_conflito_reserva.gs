/**
 * @file test_conflito_reserva.gs
 * @description Testes unitários para o motor de conflito de agendamento.
 *              Execute manualmente pelo editor GAS: selecione a função e clique em "Executar".
 *              Todos os testes devem retornar PASS.
 * @layer tests
 * @dependencies normalizarHora, horariosSobrepostos (utils.gs)
 */

// ══════════════════════════════════════════════════════════════════
// BLOCO: Runner de testes
// ══════════════════════════════════════════════════════════════════

function _assert(descricao, condicao) {
  if (condicao) {
    Logger.log(`✅ PASS: ${descricao}`);
  } else {
    Logger.log(`❌ FAIL: ${descricao}`);
    throw new Error(`FALHA NO TESTE: ${descricao}`);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Testes de normalizarHora
// ══════════════════════════════════════════════════════════════════

function testarNormalizarHora() {
  Logger.log('=== TESTES: normalizarHora ===');

  // String HH:MM
  _assert('String "12:30" → 750',  normalizarHora('12:30')    === 750);
  _assert('String "18:30" → 1110', normalizarHora('18:30')    === 1110);
  _assert('String "00:00" → 0',    normalizarHora('00:00')    === 0);
  _assert('String "23:59" → 1439', normalizarHora('23:59')    === 1439);
  _assert('String "13:30" → 810',  normalizarHora('13:30')    === 810);
  _assert('String "17:00" → 1020', normalizarHora('17:00')    === 1020);

  // String HH:MM:SS
  _assert('String "12:30:00" → 750', normalizarHora('12:30:00') === 750);
  _assert('String "08:00:00" → 480', normalizarHora('08:00:00') === 480);

  // Number (fração decimal de dia — formato que GAS pode retornar)
  _assert('Number 0.52083333 (12:30) → 750',  Math.abs(normalizarHora(0.52083333) - 750) <= 1);
  _assert('Number 0.77083333 (18:30) → 1110', Math.abs(normalizarHora(0.77083333) - 1110) <= 1);
  _assert('Number 0 (00:00) → 0',             normalizarHora(0) === 0);

  // Valores inválidos
  _assert('null → null',           normalizarHora(null)         === null);
  _assert('undefined → null',      normalizarHora(undefined)    === null);
  _assert('"" → null',             normalizarHora('')           === null);
  _assert('String "abc" → null',   normalizarHora('abc')        === null);
  _assert('Number >= 1 → null',    normalizarHora(1.5)          === null);
  _assert('Number < 0 → null',     normalizarHora(-0.1)         === null);
  _assert('"25:00" → null',        normalizarHora('25:00')      === null);
  _assert('"12:60" → null',        normalizarHora('12:60')      === null);

  Logger.log('✅ normalizarHora: todos os testes passaram\n');
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Testes da regra matemática de conflito
// ══════════════════════════════════════════════════════════════════

function testarRegraConflito() {
  Logger.log('=== TESTES: Regra matemática inicioA < fimB E fimA > inicioB ===');

  // Deve bloquear — contenção (B dentro de A)
  _assert('12:00–18:00 vs 13:00–14:00 (B contido em A) → CONFLITO',
    horariosSobrepostos(720, 1080, 780, 840) === true);

  // Deve bloquear — sobreposição início (B começa antes, termina durante A)
  _assert('12:00–18:00 vs 11:00–13:00 (B começa antes) → CONFLITO',
    horariosSobrepostos(720, 1080, 660, 780) === true);

  // Deve bloquear — sobreposição fim (B começa durante A, termina depois)
  _assert('12:00–18:00 vs 17:00–20:00 (B termina depois) → CONFLITO',
    horariosSobrepostos(720, 1080, 1020, 1200) === true);

  // Deve bloquear — A contido em B (B engloba A)
  _assert('12:00–18:00 vs 11:00–20:00 (A contido em B) → CONFLITO',
    horariosSobrepostos(720, 1080, 660, 1200) === true);

  // Deve bloquear — horários idênticos
  _assert('12:00–18:00 vs 12:00–18:00 (idênticos) → CONFLITO',
    horariosSobrepostos(720, 1080, 720, 1080) === true);

  // Deve bloquear — sobreposição parcial por 1 minuto
  _assert('12:00–13:00 vs 12:59–14:00 (1 min de sobreposição) → CONFLITO',
    horariosSobrepostos(720, 780, 779, 840) === true);

  // Caso do usuário: 12:30–18:30 vs 13:30–17:00 (deve ser BLOQUEADO)
  _assert('12:30–18:30 vs 13:30–17:00 (caso reportado) → CONFLITO',
    horariosSobrepostos(750, 1110, 810, 1020) === true);

  // Deve PERMITIR — encoste exato após
  _assert('12:00–18:00 vs 18:00–20:00 (encoste exato) → PERMITIDO',
    horariosSobrepostos(720, 1080, 1080, 1200) === false);

  // Deve PERMITIR — encoste exato antes
  _assert('10:00–12:00 vs 08:00–10:00 (encoste exato antes) → PERMITIDO',
    horariosSobrepostos(600, 720, 480, 600) === false);

  // Deve PERMITIR — sem sobreposição (B após A)
  _assert('08:00–10:00 vs 10:30–12:00 (sem sobreposição) → PERMITIDO',
    horariosSobrepostos(480, 600, 630, 720) === false);

  // Deve PERMITIR — sem sobreposição (B antes de A)
  _assert('14:00–16:00 vs 08:00–10:00 (sem sobreposição) → PERMITIDO',
    horariosSobrepostos(840, 960, 480, 600) === false);

  Logger.log('✅ Regra matemática: todos os testes passaram\n');
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Testes de _mensagemConflito
// ══════════════════════════════════════════════════════════════════

function testarMensagemConflito() {
  Logger.log('=== TESTES: _mensagemConflito ===');

  const resultado = {
    conflito: true,
    solicitado: { inicio: '13:30', fim: '17:00' },
    existente:  { inicio: '12:30', fim: '18:30', nome: 'SHOW DE TEATRO', responsavel: 'joao@ccbj.org', id: 'RES-001' },
    contexto:   { sala: 'SP-001', data: '11/05/2026' },
  };

  const msg = _mensagemConflito(resultado);

  _assert('Mensagem contém "Conflito detectado"',       msg.includes('Conflito detectado'));
  _assert('Mensagem contém o espaço',                   msg.includes('SP-001'));
  _assert('Mensagem contém a data',                     msg.includes('11/05/2026'));
  _assert('Mensagem contém horário existente 12:30',    msg.includes('12:30'));
  _assert('Mensagem contém horário existente 18:30',    msg.includes('18:30'));
  _assert('Mensagem contém nome da reserva conflitante', msg.includes('SHOW DE TEATRO'));
  _assert('Mensagem contém responsável',                msg.includes('joao@ccbj.org'));
  _assert('Mensagem contém período solicitado 13:30',   msg.includes('13:30'));
  _assert('Mensagem contém período solicitado 17:00',   msg.includes('17:00'));

  Logger.log(`Mensagem gerada: ${msg}`);
  Logger.log('✅ _mensagemConflito: todos os testes passaram\n');
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Suite completa
// ══════════════════════════════════════════════════════════════════

/**
 * Executa todos os testes do motor de conflito.
 * Para rodar: abra o editor GAS, selecione esta função e clique em "Executar".
 */
function executarTodosTesteConflito() {
  Logger.log('════════════════════════════════════════════');
  Logger.log('  SUITE: Motor de Conflito de Agendamento  ');
  Logger.log('════════════════════════════════════════════');
  testarNormalizarHora();
  testarRegraConflito();
  testarMensagemConflito();
  Logger.log('════════════════════════════════════════════');
  Logger.log('  ✅ TODOS OS TESTES PASSARAM               ');
  Logger.log('════════════════════════════════════════════');
}
