/**
 * @file modules/auth/auth_repository.gs
 * @layer modules/auth
 * @description Repositório oficial do domínio Auth.
 *
 * Encapsula TODO acesso à aba CredenciaisUsuarios (planilha MASTER).
 * O CacheService (tokens de sessão) é acessado via auth_session.gs
 * pois usa API nativa GAS sem dependência de sheet.
 *
 * REGRA: Nenhum outro módulo lê/escreve CredenciaisUsuarios diretamente.
 *
 * @depends core/utils.gs (_getSheet)
 */

var AuthRepository = (function () {

  var ABA = 'CredenciaisUsuarios';

  // Índices de coluna (0-based)
  var C = {
    EMAIL:        0,
    SENHA_HASH:   1,
    NOME:         2,
    ATIVO:        3,
    CRIADO_EM:    4,
    ULTIMO_LOGIN: 5
  };

  function _sheet() {
    return _getSheet(ABA);
  }

  function _rowToUser(r) {
    if (!r || !String(r[C.EMAIL] || '').trim()) return null;
    return {
      email:       String(r[C.EMAIL] || '').trim().toLowerCase(),
      senhaHash:   String(r[C.SENHA_HASH] || '').trim(),
      nome:        String(r[C.NOME] || '').trim(),
      ativo:       r[C.ATIVO] !== false && r[C.ATIVO] !== 'FALSE' && r[C.ATIVO] !== 0,
      criadoEm:    r[C.CRIADO_EM]    ? String(r[C.CRIADO_EM]).substring(0, 10)    : '',
      ultimoLogin: r[C.ULTIMO_LOGIN] ? String(r[C.ULTIMO_LOGIN]).substring(0, 10) : ''
    };
  }

  // ── Leitura ──────────────────────────────────────────────────────

  function listar() {
    var sh = _sheet();
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues()
      .map(_rowToUser).filter(Boolean);
  }

  function obterPorEmail(email) {
    var emailLimpo = String(email || '').trim().toLowerCase();
    var sh = _sheet();
    if (!sh || sh.getLastRow() < 2) return null;
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][C.EMAIL] || '').trim().toLowerCase() === emailLimpo) {
        return { row: _rowToUser(rows[i]), linha: i + 2 };
      }
    }
    return null;
  }

  // ── Escrita ──────────────────────────────────────────────────────

  /**
   * Cria ou atualiza credencial.
   * @param {string} email
   * @param {string|null} senhaHash — null = manter existente
   * @param {string} nome
   * @param {boolean} ativo
   * @returns {boolean} true = criado, false = atualizado
   */
  function salvar(email, senhaHash, nome, ativo) {
    var emailLimpo = String(email || '').trim().toLowerCase();
    var sh = _sheet();
    if (!sh) throw new Error('Aba CredenciaisUsuarios não encontrada.');

    var resultado = obterPorEmail(emailLimpo);
    if (resultado) {
      sh.getRange(resultado.linha, C.NOME  + 1).setValue(String(nome || '').trim());
      sh.getRange(resultado.linha, C.ATIVO + 1).setValue(ativo !== false);
      if (senhaHash) sh.getRange(resultado.linha, C.SENHA_HASH + 1).setValue(senhaHash);
      return false;
    }

    if (!senhaHash) throw new Error('Hash de senha obrigatório para novo usuário.');
    sh.appendRow([emailLimpo, senhaHash, String(nome || '').trim(), ativo !== false, new Date().toISOString(), '']);
    return true;
  }

  /** Atualiza timestamp de último login. */
  function registrarLogin(email) {
    var resultado = obterPorEmail(email);
    if (!resultado) return;
    try {
      _sheet().getRange(resultado.linha, C.ULTIMO_LOGIN + 1).setValue(new Date().toISOString());
    } catch(_) {}
  }

  // ── API pública ───────────────────────────────────────────────────

  return {
    listar:          listar,
    obterPorEmail:   obterPorEmail,
    salvar:          salvar,
    registrarLogin:  registrarLogin
  };

})();
