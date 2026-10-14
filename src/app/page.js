'use client';
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Home;
var react_1 = require("react");
var ExpertAdviceSection_1 = require("./components/ExpertAdviceSection");
function Home() {
    // État pour gérer l'authentification
    var _a = (0, react_1.useState)(false), isLoggedIn = _a[0], setIsLoggedIn = _a[1];
    var _b = (0, react_1.useState)(''), username = _b[0], setUsername = _b[1];
    var _c = (0, react_1.useState)(''), password = _c[0], setPassword = _c[1];
    var _d = (0, react_1.useState)(''), error = _d[0], setError = _d[1];
    var _e = (0, react_1.useState)(false), loading = _e[0], setLoading = _e[1];
    var _f = (0, react_1.useState)(null), userInfo = _f[0], setUserInfo = _f[1];
    // Vérifier si une session existe au chargement
    (0, react_1.useEffect)(function () {
        var sessionData = document.cookie
            .split('; ')
            .find(function (row) { return row.startsWith('steo_elite_session_data='); });
        if (sessionData) {
            try {
                var data = JSON.parse(decodeURIComponent(sessionData.split('=')[1]));
                if (data.expiry > Date.now()) {
                    setUserInfo({
                        username: data.user,
                        name: data.name,
                        role: data.role,
                        daysRemaining: data.daysRemaining
                    });
                    setIsLoggedIn(true);
                }
            }
            catch (_a) {
                // Session invalide
            }
        }
    }, []);
    // Fonction de connexion
    var handleLogin = function (e) {
        return __awaiter(this, void 0, void 0, function () {
            var response, data, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        e.preventDefault();
                        setError('');
                        setLoading(true);
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 4, 5, 6]);
                        return [4 /*yield*/, fetch('/api/auth/login', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ username: username, password: password }),
                            })];
                    case 2:
                        response = _b.sent();
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _b.sent();
                        if (data.success) {
                            setUserInfo({
                                username: data.user.username,
                                name: data.user.name,
                                role: data.user.role,
                                daysRemaining: data.user.daysRemaining,
                                expiresAt: data.user.expiresAt
                            });
                            setIsLoggedIn(true);
                        }
                        else {
                            setError(data.error || 'Identifiants incorrects');
                        }
                        return [3 /*break*/, 6];
                    case 4:
                        _a = _b.sent();
                        setError('Erreur de connexion');
                        return [3 /*break*/, 6];
                    case 5:
                        setLoading(false);
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    // Fonction de déconnexion
    var handleLogout = function () {
        fetch('/api/auth/logout', { method: 'POST' });
        setIsLoggedIn(false);
        setUserInfo(null);
    };
    // Afficher la page de connexion ou l'application
    if (!isLoggedIn) {
        return (<div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
                padding: '20px'
            }}>
        <div style={{
                background: '#1a1a1a',
                borderRadius: '16px',
                padding: '40px',
                maxWidth: '400px',
                width: '100%',
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
            }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{
                display: 'inline-flex',
                padding: '16px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                marginBottom: '16px'
            }}>
              <span style={{ fontSize: '32px' }}>👑</span>
            </div>
            <h1 style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#f97316',
                margin: 0
            }}>Steo Élite</h1>
            <p style={{ color: '#888', margin: '8px 0 0 0' }}>Sports Predictor</p>
          </div>

          {/* Formulaire */}
          <form onSubmit={handleLogin}>
            {error && (<div style={{
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px',
                    color: '#ef4444'
                }}>
                {error}
              </div>)}

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                color: '#fff',
                marginBottom: '8px',
                fontSize: '14px'
            }}>Identifiant</label>
              <input type="text" value={username} onChange={function (e) { return setUsername(e.target.value); }} style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid #333',
                background: '#0a0a0a',
                color: '#fff',
                fontSize: '16px',
                boxSizing: 'border-box'
            }} placeholder="Entrez votre identifiant" required/>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                color: '#fff',
                marginBottom: '8px',
                fontSize: '14px'
            }}>Mot de passe</label>
              <input type="password" value={password} onChange={function (e) { return setPassword(e.target.value); }} style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid #333',
                background: '#0a0a0a',
                color: '#fff',
                fontSize: '16px',
                boxSizing: 'border-box'
            }} placeholder="Entrez votre mot de passe" required/>
            </div>

            <button type="submit" disabled={loading || !username || !password} style={{
                width: '100%',
                padding: '14px',
                borderRadius: '8px',
                border: 'none',
                background: loading ? '#666' : '#f97316',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s'
            }}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          <p style={{
                textAlign: 'center',
                color: '#666',
                fontSize: '12px',
                marginTop: '20px'
            }}>
            🔒 Connexion sécurisée
          </p>
        </div>
      </div>);
    }
    // Application principale
    return <AppDashboard onLogout={handleLogout} userInfo={userInfo}/>;
}
// Types
// Helper function pour formater les cotes en toute sécurité
var formatOdds = function (odds) {
    if (odds == null || typeof odds !== 'number')
        return '-';
    return odds.toFixed(2);
};
// Composant Dashboard
// ===== SECTION NFL FOOTBALL =====
function NFLSection() {
    var _this = this;
    var _a = (0, react_1.useState)([]), nflMatches = _a[0], setNflMatches = _a[1];
    var _b = (0, react_1.useState)(true), loading = _b[0], setLoading = _b[1];
    var _c = (0, react_1.useState)(null), error = _c[0], setError = _c[1];
    var _d = (0, react_1.useState)(new Date()), lastUpdate = _d[0], setLastUpdate = _d[1];
    var _e = (0, react_1.useState)('all'), activeFilter = _e[0], setActiveFilter = _e[1];
    (0, react_1.useEffect)(function () {
        var fetchNFL = function () { return __awaiter(_this, void 0, void 0, function () {
            var response, data, err_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, 4, 5]);
                        setLoading(true);
                        return [4 /*yield*/, fetch('/api/nfl-pro')];
                    case 1:
                        response = _a.sent();
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = _a.sent();
                        if (data.predictions) {
                            setNflMatches(data.predictions);
                        }
                        setLastUpdate(new Date());
                        setError(null);
                        return [3 /*break*/, 5];
                    case 3:
                        err_1 = _a.sent();
                        setError('Erreur lors du chargement des matchs NFL');
                        return [3 /*break*/, 5];
                    case 4:
                        setLoading(false);
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        }); };
        fetchNFL();
    }, []);
    var valueBets = nflMatches.filter(function (m) { var _a, _b, _c; return (_c = (_b = (_a = m.insights) === null || _a === void 0 ? void 0 : _a.moneyline) === null || _b === void 0 ? void 0 : _b.valueBet) === null || _c === void 0 ? void 0 : _c.detected; });
    var highConfidence = nflMatches.filter(function (m) { var _a; return (((_a = m.insights) === null || _a === void 0 ? void 0 : _a.confidence) || 0) >= 70; });
    var filteredMatches = activeFilter === 'value' ? valueBets
        : activeFilter === 'high' ? highConfidence
            : nflMatches;
    // Calculer la plage horaire des matchs
    var getMatchTimeRange = function () {
        if (nflMatches.length === 0)
            return null;
        var times = nflMatches.map(function (m) { return m.time; }).filter(Boolean).sort();
        if (times.length === 0)
            return null;
        return "".concat(times[0], " - ").concat(times[times.length - 1]);
    };
    var timeRange = getMatchTimeRange();
    return (<div style={{ marginBottom: '12px' }}>
      {/* Header avec icône ballon NFL */}
      <div style={{ marginBottom: '12px' }}>
        <h2 style={{
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#22c55e',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }}>
          <span style={{
            fontSize: '20px',
            filter: 'drop-shadow(0 2px 4px rgba(34, 197, 94, 0.3))'
        }}>🏈</span>
          NFL Football PRO
        </h2>
        <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
          Prédictions basées sur DVOA, EPA, QBR et analyse des blessures
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <p style={{ color: '#666', fontSize: '10px' }}>
            Mise à jour: {lastUpdate.toLocaleTimeString('fr-FR')} • {nflMatches.length} matchs
          </p>
          {timeRange && (<p style={{ color: '#22c55e', fontSize: '10px', fontWeight: 'bold' }}>
              🕐 {timeRange}
            </p>)}
        </div>
      </div>

      {/* Stats à venir */}
      {nflMatches.length > 0 && (<div style={{
                background: 'linear-gradient(135deg, #0d2000 0%, #1a1a1a 100%)',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px',
                border: '1px solid #22c55e30'
            }}>
          <div style={{ fontSize: '11px', color: '#22c55e', fontWeight: 'bold', marginBottom: '8px' }}>
            📊 Statistiques de la semaine
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#22c55e' }}>{nflMatches.length}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>Matchs</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f97316' }}>{valueBets.length}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>Value Bets</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#3b82f6' }}>{highConfidence.length}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>Confiance Haute</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#eab308' }}>
                {nflMatches.length > 0 ? (nflMatches.reduce(function (acc, m) { var _a; return acc + (((_a = m.projected) === null || _a === void 0 ? void 0 : _a.totalPoints) || 0); }, 0) / nflMatches.length).toFixed(1) : '0'}
              </div>
              <div style={{ fontSize: '9px', color: '#888' }}>Moy. Points</div>
            </div>
          </div>
        </div>)}

      {/* Filters */}
      <div style={{
            display: 'flex',
            gap: '6px',
            marginBottom: '12px',
            flexWrap: 'wrap'
        }}>
        <button onClick={function () { return setActiveFilter('all'); }} style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: activeFilter === 'all' ? '1px solid #22c55e' : '1px solid #333',
            background: activeFilter === 'all' ? '#22c55e' : 'transparent',
            color: activeFilter === 'all' ? '#fff' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeFilter === 'all' ? 'bold' : 'normal'
        }}>
          🏈 Tous ({nflMatches.length})
        </button>
        <button onClick={function () { return setActiveFilter('value'); }} style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: activeFilter === 'value' ? '1px solid #22c55e' : '1px solid #333',
            background: activeFilter === 'value' ? '#22c55e' : 'transparent',
            color: activeFilter === 'value' ? '#fff' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeFilter === 'value' ? 'bold' : 'normal'
        }}>
          💰 Value ({valueBets.length})
        </button>
        <button onClick={function () { return setActiveFilter('high'); }} style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: activeFilter === 'high' ? '1px solid #f97316' : '1px solid #333',
            background: activeFilter === 'high' ? '#f97316' : 'transparent',
            color: activeFilter === 'high' ? '#fff' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeFilter === 'high' ? 'bold' : 'normal'
        }}>
          ⭐ Confiance ({highConfidence.length})
        </button>
      </div>

      {/* Loading */}
      {loading ? (<div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
          <span style={{ fontSize: '12px' }}>Chargement NFL...</span>
        </div>) : error ? (<div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>❌</div>
          <span style={{ fontSize: '12px' }}>{error}</span>
        </div>) : filteredMatches.length === 0 ? (<div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🏈</div>
          <span style={{ fontSize: '12px' }}>Aucun match NFL prévu</span>
        </div>) : (<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredMatches.map(function (match, idx) { return (<NFLMatchCard key={match.id} match={match} index={idx + 1}/>); })}
        </div>)}
    </div>);
}
function NFLMatchCard(_a) {
    var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    var match = _a.match, index = _a.index;
    var isHomeFavorite = match.projected.homeWinProb > match.projected.awayWinProb;
    var winnerTeam = isHomeFavorite ? match.homeTeam : match.awayTeam;
    var winnerAbbr = isHomeFavorite ? match.homeAbbr : match.awayAbbr;
    var winnerProb = isHomeFavorite ? match.projected.homeWinProb : match.projected.awayWinProb;
    var confidenceColor = match.insights.confidence >= 70 ? '#22c55e'
        : match.insights.confidence >= 50 ? '#f97316' : '#ef4444';
    var hasValueBet = (_c = (_b = match.insights.moneyline) === null || _b === void 0 ? void 0 : _b.valueBet) === null || _c === void 0 ? void 0 : _c.detected;
    var valueEdge = ((_e = (_d = match.insights.moneyline) === null || _d === void 0 ? void 0 : _d.valueBet) === null || _e === void 0 ? void 0 : _e.edge) || 0;
    // Interprétation des métriques
    var dvoaDiff = ((_f = match.factors) === null || _f === void 0 ? void 0 : _f.dvoaDiff) || 0;
    var epaDiff = ((_g = match.factors) === null || _g === void 0 ? void 0 : _g.epaDiff) || 0;
    var turnoverEdge = ((_h = match.factors) === null || _h === void 0 ? void 0 : _h.turnoverEdge) || 0;
    var restEdge = ((_j = match.factors) === null || _j === void 0 ? void 0 : _j.restEdge) || 0;
    var injuryEdge = ((_k = match.factors) === null || _k === void 0 ? void 0 : _k.injuryEdge) || 0;
    // Score projeté formaté
    var homeScore = Math.round(match.projected.homePoints);
    var awayScore = Math.round(match.projected.awayPoints);
    return (<div style={{
            background: 'linear-gradient(135deg, #1a1a1a 0%, #0d2000 100%)',
            borderRadius: '12px',
            padding: '14px',
            border: hasValueBet ? '1px solid #22c55e50' : '1px solid #22c55e30',
            boxShadow: hasValueBet ? '0 4px 20px rgba(34, 197, 94, 0.1)' : '0 4px 20px rgba(34, 197, 94, 0.05)'
        }}>
      {/* Header */}
      <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            background: '#22c55e',
            color: '#fff',
            width: '26px',
            height: '26px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold'
        }}>{index}</span>
          <span style={{ fontSize: '11px', color: '#888' }}>🏈 NFL</span>
          {match.isLive && (<span style={{
                background: '#ef4444',
                color: '#fff',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '9px',
                fontWeight: 'bold'
            }}>LIVE</span>)}
          {/* Heure du match */}
          {match.time && (<span style={{
                background: '#1a1a1a',
                color: '#22c55e',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 'bold'
            }}>
              🕐 {match.time}
            </span>)}
        </div>
        <div style={{
            background: "".concat(confidenceColor, "20"),
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            color: confidenceColor,
            fontWeight: 'bold'
        }}>
          {match.insights.confidence}% Confiance
        </div>
      </div>

      {/* TEAMS - avec SURBRILLANCE du favori */}
      <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            padding: '10px',
            background: '#111',
            borderRadius: '10px'
        }}>
        {/* Home Team */}
        <div style={{
            flex: 1,
            textAlign: 'center',
            padding: '8px',
            borderRadius: '8px',
            background: isHomeFavorite ? 'linear-gradient(135deg, #22c55e20 0%, #22c55e10 100%)' : 'transparent',
            border: isHomeFavorite ? '2px solid #22c55e' : '2px solid transparent'
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 'bold',
            color: isHomeFavorite ? '#22c55e' : '#fff',
            marginBottom: '4px'
        }}>
            {isHomeFavorite && '⭐ '}{match.homeTeam}
          </div>
          <div style={{ fontSize: '10px', color: '#888' }}>
            🏠 Domicile {match.homeRecord && "(".concat(match.homeRecord, ")")}
          </div>
          <div style={{
            marginTop: '6px',
            fontSize: '18px',
            fontWeight: 'bold',
            color: isHomeFavorite ? '#22c55e' : '#888'
        }}>
            {Math.round(winnerProb * 100)}%
          </div>
        </div>
        
        {/* VS */}
        <div style={{ padding: '0 10px' }}>
          <div style={{
            fontSize: '10px',
            color: '#666',
            background: '#1a1a1a',
            padding: '6px 10px',
            borderRadius: '6px'
        }}>
            VS
          </div>
        </div>
        
        {/* Away Team */}
        <div style={{
            flex: 1,
            textAlign: 'center',
            padding: '8px',
            borderRadius: '8px',
            background: !isHomeFavorite ? 'linear-gradient(135deg, #3b82f620 0%, #3b82f610 100%)' : 'transparent',
            border: !isHomeFavorite ? '2px solid #3b82f6' : '2px solid transparent'
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 'bold',
            color: !isHomeFavorite ? '#3b82f6' : '#fff',
            marginBottom: '4px'
        }}>
            {!isHomeFavorite && '⭐ '}{match.awayTeam}
          </div>
          <div style={{ fontSize: '10px', color: '#888' }}>
            ✈️ Extérieur {match.awayRecord && "(".concat(match.awayRecord, ")")}
          </div>
          <div style={{
            marginTop: '6px',
            fontSize: '18px',
            fontWeight: 'bold',
            color: !isHomeFavorite ? '#3b82f6' : '#888'
        }}>
            {Math.round((1 - winnerProb) * 100)}%
          </div>
        </div>
      </div>
      
      {/* PRÉDICTION PRINCIPALE */}
      <div style={{
            background: "linear-gradient(135deg, ".concat(isHomeFavorite ? '#22c55e15' : '#3b82f615', " 0%, #0a0a0a 100%)"),
            borderRadius: '10px',
            padding: '12px',
            marginBottom: '12px',
            border: "1px solid ".concat(isHomeFavorite ? '#22c55e30' : '#3b82f630')
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>🏆 VAINQUEUR PRÉDIT</div>
            <div style={{
            fontSize: '16px',
            fontWeight: 'bold',
            color: isHomeFavorite ? '#22c55e' : '#3b82f6'
        }}>
              ⭐ {winnerTeam}
            </div>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
              Score projeté: {match.homeAbbr} {homeScore} - {awayScore} {match.awayAbbr}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: confidenceColor }}>
              {Math.round(winnerProb * 100)}%
            </div>
            <div style={{ fontSize: '10px', color: '#888' }}>
              Confiance: {match.insights.confidence >= 70 ? 'Haute' : match.insights.confidence >= 50 ? 'Moyenne' : 'Faible'}
            </div>
          </div>
        </div>
      </div>

      {/* GRILLE PRÉDICTIONS NFL */}
      <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
            marginBottom: '10px'
        }}>
        {/* SPREAD */}
        <div style={{
            background: '#1a1a1a',
            borderRadius: '8px',
            padding: '10px'
        }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>📊 SPREAD</div>
          <div style={{
            fontSize: '14px',
            fontWeight: 'bold',
            color: match.insights.spread.recommendation === 'home' ? '#22c55e'
                : match.insights.spread.recommendation === 'away' ? '#f97316' : '#888'
        }}>
            {match.insights.spread.recommendation === 'home' ? "\u2705 ".concat(match.homeAbbr, " couvre")
            : match.insights.spread.recommendation === 'away' ? "\u2705 ".concat(match.awayAbbr, " couvre")
                : '⏳ Éviter'}
          </div>
          <div style={{ fontSize: '9px', color: '#666' }}>
            {match.insights.spread.line !== 0 ? "Ligne: ".concat(match.insights.spread.line > 0 ? '-' : '+').concat(Math.abs(match.insights.spread.line)) : 'Match serré'}
          </div>
        </div>
        
        {/* TOTAL POINTS */}
        <div style={{
            background: '#1a1a1a',
            borderRadius: '8px',
            padding: '10px'
        }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>📈 TOTAL POINTS</div>
          <div style={{
            fontSize: '14px',
            fontWeight: 'bold',
            color: ((_l = match.insights.total) === null || _l === void 0 ? void 0 : _l.recommendation) === 'over' ? '#22c55e'
                : ((_m = match.insights.total) === null || _m === void 0 ? void 0 : _m.recommendation) === 'under' ? '#ef4444' : '#888'
        }}>
            {((_o = match.insights.total) === null || _o === void 0 ? void 0 : _o.recommendation) === 'over' ? '⬆️ Parier Over'
            : ((_p = match.insights.total) === null || _p === void 0 ? void 0 : _p.recommendation) === 'under' ? '⬇️ Parier Under'
                : '⏳ Éviter'} {(_q = match.insights.total) === null || _q === void 0 ? void 0 : _q.line}
          </div>
          <div style={{ fontSize: '9px', color: '#666' }}>
            Prédit: {((_r = match.insights.total) === null || _r === void 0 ? void 0 : _r.predicted) || match.projected.totalPoints} pts
          </div>
        </div>
        
        {/* DVOA COMPARISON */}
        <div style={{
            background: '#1a1a1a',
            borderRadius: '8px',
            padding: '10px'
        }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>📉 DVOA (Efficacité)</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: dvoaDiff > 0 ? '#22c55e' : dvoaDiff < 0 ? '#ef4444' : '#888' }}>
            {dvoaDiff > 0 ? "\u2705 ".concat(match.homeAbbr, " +").concat(dvoaDiff.toFixed(1), "%")
            : dvoaDiff < 0 ? "\u2705 ".concat(match.awayAbbr, " +").concat(Math.abs(dvoaDiff).toFixed(1), "%")
                : '⚖️ Égal'}
          </div>
          <div style={{ fontSize: '9px', color: '#666' }}>
            Avantage global
          </div>
        </div>
        
        {/* EPA COMPARISON */}
        <div style={{
            background: '#1a1a1a',
            borderRadius: '8px',
            padding: '10px'
        }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>⚡ EPA (Points/jeu)</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: epaDiff > 0 ? '#22c55e' : epaDiff < 0 ? '#ef4444' : '#888' }}>
            {epaDiff > 0 ? "\u2705 ".concat(match.homeAbbr, " +").concat(epaDiff.toFixed(2))
            : epaDiff < 0 ? "\u2705 ".concat(match.awayAbbr, " +").concat(Math.abs(epaDiff).toFixed(2))
                : '⚖️ Égal'}
          </div>
          <div style={{ fontSize: '9px', color: '#666' }}>
            Efficacité offensive
          </div>
        </div>
        
        {/* TURNOVER EDGE */}
        <div style={{
            background: '#1a1a1a',
            borderRadius: '8px',
            padding: '10px'
        }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>🔄 Turnovers</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: turnoverEdge > 0 ? '#22c55e' : turnoverEdge < 0 ? '#ef4444' : '#888' }}>
            {turnoverEdge > 0 ? "\u2705 ".concat(match.homeAbbr, " +").concat(turnoverEdge)
            : turnoverEdge < 0 ? "\u2705 ".concat(match.awayAbbr, " +").concat(Math.abs(turnoverEdge))
                : '⚖️ Égal'}
          </div>
          <div style={{ fontSize: '9px', color: '#666' }}>
            Différentiel turnovers
          </div>
        </div>
        
        {/* REST/INJURY EDGE */}
        <div style={{
            background: '#1a1a1a',
            borderRadius: '8px',
            padding: '10px'
        }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>🏥 Facteurs</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: (restEdge > 0 || injuryEdge > 0) ? '#22c55e' : (restEdge < 0 || injuryEdge < 0) ? '#ef4444' : '#888' }}>
            {(restEdge > 0 || injuryEdge > 0) ? "\u2705 ".concat(match.homeAbbr, " avantag\u00E9")
            : (restEdge < 0 || injuryEdge < 0) ? "\u2705 ".concat(match.awayAbbr, " avantag\u00E9")
                : '⚖️ Équilibré'}
          </div>
          <div style={{ fontSize: '9px', color: '#666' }}>
            Repos: {restEdge > 0 ? '+' : ''}{restEdge.toFixed(1)}j | Blessures: {injuryEdge > 0 ? '+' : ''}{injuryEdge.toFixed(1)}
          </div>
        </div>
      </div>

      {/* QB Matchup */}
      <div style={{
            background: '#1a1a1a',
            borderRadius: '8px',
            padding: '10px',
            marginBottom: '10px'
        }}>
        <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>🏈 DUEL QB</div>
        <div style={{ fontSize: '11px', color: '#fff' }}>
          {match.factors.qbMatchup.length > 60 ? match.factors.qbMatchup.slice(0, 60) + '...' : match.factors.qbMatchup}
        </div>
      </div>

      {/* Injury Report */}
      {match.injuryReport && (((_t = (_s = match.injuryReport.home) === null || _s === void 0 ? void 0 : _s.keyPlayersOut) === null || _t === void 0 ? void 0 : _t.length) > 0 || ((_v = (_u = match.injuryReport.away) === null || _u === void 0 ? void 0 : _u.keyPlayersOut) === null || _v === void 0 ? void 0 : _v.length) > 0) && (<div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '10px',
                marginBottom: '10px'
            }}>
          <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 'bold', marginBottom: '6px' }}>
            🏥 Blessures
          </div>
          <div style={{ fontSize: '10px', color: '#888' }}>
            {match.injuryReport.summary}
          </div>
        </div>)}

      {/* Value Bet Badge */}
      {hasValueBet && (<div style={{
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                borderRadius: '8px',
                padding: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
          <div>
            <div style={{ fontSize: '11px', color: '#fff', opacity: 0.9 }}>📌 VALUE BET - PARIS INTELLIGENT</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>
              Parier sur {match.insights.moneyline.valueBet.type === 'home' ? match.homeTeam : match.awayTeam}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>
              +{(valueEdge * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: '10px', color: '#fff', opacity: 0.8 }}>Avantage détecté</div>
          </div>
        </div>)}
    </div>);
}
// ===== SECTION NHL HOCKEY =====
function NHLSection(_a) {
    var matches = _a.matches, loading = _a.loading, lastUpdate = _a.lastUpdate;
    var _b = (0, react_1.useState)('all'), activeTab = _b[0], setActiveTab = _b[1];
    var now = new Date();
    var liveMatches = matches.filter(function (m) { return m.isLive; });
    var finishedMatches = matches.filter(function (m) { return m.isFinished; });
    var upcomingMatches = matches.filter(function (m) { return !m.isLive && !m.isFinished; });
    var displayedMatches = activeTab === 'live' ? liveMatches
        : activeTab === 'finished' ? finishedMatches
            : matches;
    return (<div style={{ marginBottom: '12px' }}>
      {/* Header */}
      <div style={{ marginBottom: '12px' }}>
        <h2 style={{
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#06b6d4',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }}>
          <span style={{
            fontSize: '20px',
            filter: 'drop-shadow(0 2px 4px rgba(6, 182, 212, 0.3))'
        }}>🏒</span>
          NHL Hockey
        </h2>
        <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
          Matchs de hockey NHL en direct et à venir
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <p style={{ color: '#666', fontSize: '10px' }}>
            Mise à jour: {lastUpdate.toLocaleTimeString('fr-FR')} • {matches.length} matchs
          </p>
        </div>
      </div>

      {/* Stats */}
      {matches.length > 0 && (<div style={{
                background: 'linear-gradient(135deg, #0c1a1a 0%, #1a1a1a 100%)',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px',
                border: '1px solid #06b6d430'
            }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#06b6d4' }}>{upcomingMatches.length}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>À venir</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ef4444' }}>{liveMatches.length}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>En direct</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#22c55e' }}>{finishedMatches.length}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>Terminés</div>
            </div>
          </div>
        </div>)}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <button onClick={function () { return setActiveTab('all'); }} style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: activeTab === 'all' ? '1px solid #06b6d4' : '1px solid #333',
            background: activeTab === 'all' ? '#06b6d4' : 'transparent',
            color: activeTab === 'all' ? '#fff' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeTab === 'all' ? 'bold' : 'normal'
        }}>
          🏒 Tous ({matches.length})
        </button>
        <button onClick={function () { return setActiveTab('live'); }} style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: activeTab === 'live' ? '1px solid #ef4444' : '1px solid #333',
            background: activeTab === 'live' ? '#ef4444' : 'transparent',
            color: activeTab === 'live' ? '#fff' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeTab === 'live' ? 'bold' : 'normal'
        }}>
          🔴 Live ({liveMatches.length})
        </button>
        <button onClick={function () { return setActiveTab('finished'); }} style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: activeTab === 'finished' ? '1px solid #22c55e' : '1px solid #333',
            background: activeTab === 'finished' ? '#22c55e' : 'transparent',
            color: activeTab === 'finished' ? '#fff' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeTab === 'finished' ? 'bold' : 'normal'
        }}>
          ✅ Terminés ({finishedMatches.length})
        </button>
      </div>

      {/* Loading */}
      {loading ? (<div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
          <span style={{ fontSize: '12px' }}>Chargement NHL...</span>
        </div>) : displayedMatches.length === 0 ? (<div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🏒</div>
          <span style={{ fontSize: '12px' }}>Aucun match NHL prévu</span>
          <p style={{ fontSize: '10px', color: '#555', marginTop: '8px' }}>
            Les matchs NHL apparaissent selon le calendrier de la ligue
          </p>
        </div>) : (<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {displayedMatches.slice(0, 15).map(function (match, idx) { return (<NHLMatchCard key={match.id} match={match} index={idx + 1}/>); })}
        </div>)}
    </div>);
}
// NHL Match Card Component
function NHLMatchCard(_a) {
    var _b, _c;
    var match = _a.match, index = _a.index;
    var isLive = match.isLive;
    var isFinished = match.isFinished;
    // Scores
    var homeScore = match.homeScore;
    var awayScore = match.awayScore;
    // Déterminer le favori
    var isHomeFavorite = match.oddsHome < match.oddsAway;
    var winnerProb = isHomeFavorite
        ? Math.round((1 / match.oddsHome) * 100)
        : Math.round((1 / match.oddsAway) * 100);
    // Période et temps
    var period = match.period;
    var clock = match.clock;
    var periodLabel = period ? (period <= 3 ? "P".concat(period) :
        period === 4 ? 'OT' :
            "OT".concat(period - 3)) : '';
    return (<div style={{
            background: 'linear-gradient(135deg, #1a1a1a 0%, #0c1a1a 100%)',
            borderRadius: '12px',
            padding: '14px',
            border: isLive ? '1px solid #ef444450' : '1px solid #06b6d430',
            boxShadow: isLive ? '0 4px 20px rgba(239, 68, 68, 0.2)' : '0 4px 20px rgba(6, 182, 212, 0.05)'
        }}>
      {/* Header */}
      <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            background: '#06b6d4',
            color: '#fff',
            width: '26px',
            height: '26px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold'
        }}>{index}</span>
          <span style={{ fontSize: '11px', color: '#888' }}>🏒 NHL</span>
          {isLive && (<span style={{
                background: '#ef4444',
                color: '#fff',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '9px',
                fontWeight: 'bold',
                animation: 'pulse 1s infinite'
            }}>LIVE</span>)}
          {isFinished && (<span style={{
                background: '#22c55e',
                color: '#fff',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '9px',
                fontWeight: 'bold'
            }}>TERMINÉ</span>)}
        </div>
        <div style={{
            background: "".concat(isHomeFavorite ? '#06b6d4' : '#3b82f6', "20"),
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            color: isHomeFavorite ? '#06b6d4' : '#3b82f6',
            fontWeight: 'bold'
        }}>
          {match.league || 'NHL'}
        </div>
      </div>

      {/* TEAMS */}
      <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            padding: '10px',
            background: isLive ? '#1a0a0a' : '#111',
            borderRadius: '10px',
            border: isLive ? '1px solid #ef444430' : 'none'
        }}>
        {/* Home Team */}
        <div style={{
            flex: 1,
            textAlign: 'center',
            padding: '8px',
            borderRadius: '8px',
            background: isHomeFavorite ? 'linear-gradient(135deg, #06b6d420 0%, #06b6d410 100%)' : 'transparent',
            border: isHomeFavorite ? '2px solid #06b6d4' : '2px solid transparent'
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 'bold',
            color: isHomeFavorite ? '#06b6d4' : '#fff',
            marginBottom: '4px'
        }}>
            {isHomeFavorite && '⭐ '}{match.homeTeam}
          </div>
          <div style={{ fontSize: '10px', color: '#888' }}>
            🏠 Domicile {match.homeRecord && "(".concat(match.homeRecord, ")")}
          </div>
          {/* SCORE */}
          {(isLive || isFinished) && homeScore !== undefined ? (<div style={{
                marginTop: '6px',
                fontSize: '28px',
                fontWeight: 'bold',
                color: homeScore > (awayScore || 0) ? '#22c55e' : homeScore < (awayScore || 0) ? '#ef4444' : '#f97316'
            }}>
              {homeScore}
            </div>) : (<div style={{
                marginTop: '6px',
                fontSize: '18px',
                fontWeight: 'bold',
                color: isHomeFavorite ? '#06b6d4' : '#888'
            }}>
              {isHomeFavorite ? winnerProb : 100 - winnerProb}%
            </div>)}
        </div>
        
        {/* VS / Clock */}
        <div style={{ padding: '0 10px', textAlign: 'center' }}>
          {isLive && clock ? (<div style={{
                background: '#ef444420',
                border: '1px solid #ef4444',
                padding: '6px 12px',
                borderRadius: '6px'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#ef4444' }}>
                {periodLabel}
              </div>
              <div style={{ fontSize: '12px', color: '#fff', fontFamily: 'monospace' }}>
                {clock}
              </div>
            </div>) : (<div style={{
                fontSize: '10px',
                color: '#666',
                background: '#1a1a1a',
                padding: '6px 10px',
                borderRadius: '6px'
            }}>
              VS
            </div>)}
        </div>
        
        {/* Away Team */}
        <div style={{
            flex: 1,
            textAlign: 'center',
            padding: '8px',
            borderRadius: '8px',
            background: !isHomeFavorite ? 'linear-gradient(135deg, #3b82f620 0%, #3b82f610 100%)' : 'transparent',
            border: !isHomeFavorite ? '2px solid #3b82f6' : '2px solid transparent'
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 'bold',
            color: !isHomeFavorite ? '#3b82f6' : '#fff',
            marginBottom: '4px'
        }}>
            {!isHomeFavorite && '⭐ '}{match.awayTeam}
          </div>
          <div style={{ fontSize: '10px', color: '#888' }}>
            ✈️ Extérieur {match.awayRecord && "(".concat(match.awayRecord, ")")}
          </div>
          {/* SCORE */}
          {(isLive || isFinished) && awayScore !== undefined ? (<div style={{
                marginTop: '6px',
                fontSize: '28px',
                fontWeight: 'bold',
                color: awayScore > (homeScore || 0) ? '#22c55e' : awayScore < (homeScore || 0) ? '#ef4444' : '#f97316'
            }}>
              {awayScore}
            </div>) : (<div style={{
                marginTop: '6px',
                fontSize: '18px',
                fontWeight: 'bold',
                color: !isHomeFavorite ? '#3b82f6' : '#888'
            }}>
              {!isHomeFavorite ? winnerProb : 100 - winnerProb}%
            </div>)}
        </div>
      </div>

      {/* Cotes */}
      <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '8px',
            marginTop: '12px',
            paddingTop: '10px',
            borderTop: '1px solid #222'
        }}>
        <span style={{
            padding: '4px 10px',
            background: isHomeFavorite ? '#06b6d4' : '#1a1a1a',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#fff',
            fontWeight: isHomeFavorite ? 'bold' : 'normal'
        }}>
          {match.homeTeam.slice(0, 10)}: {formatOdds(match.oddsHome)}
        </span>
        {match.oddsDraw != null && typeof match.oddsDraw === 'number' && (<span style={{
                padding: '4px 10px',
                background: '#1a1a1a',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#888'
            }}>
            Nul: {formatOdds(match.oddsDraw)}
          </span>)}
        <span style={{
            padding: '4px 10px',
            background: !isHomeFavorite ? '#3b82f6' : '#1a1a1a',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#fff',
            fontWeight: !isHomeFavorite ? 'bold' : 'normal'
        }}>
          {match.awayTeam.slice(0, 10)}: {formatOdds(match.oddsAway)}
        </span>
      </div>
      
      {/* Prédictions NHL Avancées */}
      {match.nhlPredictions && !isLive && !isFinished && (<>
          {/* Score projeté */}
          <div style={{
                background: 'linear-gradient(135deg, #06b6d410 0%, #0a0a0a 100%)',
                borderRadius: '8px',
                padding: '10px',
                marginTop: '10px',
                border: '1px solid #06b6d420'
            }}>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px' }}>📊 SCORE PROJETÉ (Modèle xG)</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#06b6d4' }}>
                  {match.nhlPredictions.projectedHomeGoals.toFixed(1)}
                </div>
                <div style={{ fontSize: '9px', color: '#666' }}>{match.homeTeam.split(' ').pop()}</div>
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>vs</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#3b82f6' }}>
                  {match.nhlPredictions.projectedAwayGoals.toFixed(1)}
                </div>
                <div style={{ fontSize: '9px', color: '#666' }}>{match.awayTeam.split(' ').pop()}</div>
              </div>
            </div>
          </div>
          
          {/* Grille facteurs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginTop: '10px' }}>
            {/* Total buts */}
            <div style={{ background: '#1a1a1a', borderRadius: '6px', padding: '8px' }}>
              <div style={{ fontSize: '9px', color: '#888', marginBottom: '4px' }}>📈 TOTAL BUTS</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: match.nhlPredictions.overProb > 0.5 ? '#22c55e' : '#f97316' }}>
                {match.nhlPredictions.overProb > 0.5 ? '⬆️ Over' : '⬇️ Under'} {match.nhlPredictions.totalGoalsLine}
              </div>
              <div style={{ fontSize: '9px', color: '#666' }}>
                Proj: {(match.nhlPredictions.projectedHomeGoals + match.nhlPredictions.projectedAwayGoals).toFixed(1)}
              </div>
            </div>
            
            {/* Confiance */}
            <div style={{ background: '#1a1a1a', borderRadius: '6px', padding: '8px' }}>
              <div style={{ fontSize: '9px', color: '#888', marginBottom: '4px' }}>🎯 CONFIANCE</div>
              <div style={{
                fontSize: '13px',
                fontWeight: 'bold',
                color: match.nhlPredictions.confidence >= 60 ? '#22c55e' : match.nhlPredictions.confidence >= 50 ? '#f97316' : '#ef4444'
            }}>
                {match.nhlPredictions.confidence}%
              </div>
              <div style={{ fontSize: '9px', color: '#666' }}>
                {match.nhlPredictions.confidence >= 60 ? 'Haute' : match.nhlPredictions.confidence >= 50 ? 'Moyenne' : 'Faible'}
              </div>
            </div>
          </div>
          
          {/* Facteurs NHL */}
          {match.nhlFactors && (<div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '9px', color: '#06b6d4', marginBottom: '6px' }}>🏒 ANALYSE AVANCÉE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '10px', color: '#aaa', background: '#111', padding: '6px 8px', borderRadius: '4px' }}>
                  🧤 {match.nhlFactors.goalieMatchup}
                </div>
                <div style={{ fontSize: '10px', color: '#aaa', background: '#111', padding: '6px 8px', borderRadius: '4px' }}>
                  ⚡ {match.nhlFactors.specialTeams}
                </div>
                <div style={{ fontSize: '10px', color: '#aaa', background: '#111', padding: '6px 8px', borderRadius: '4px' }}>
                  📊 {match.nhlFactors.corsiEdge}
                </div>
                <div style={{ fontSize: '10px', color: '#aaa', background: '#111', padding: '6px 8px', borderRadius: '4px' }}>
                  📉 {match.nhlFactors.pdoRegression}
                </div>
              </div>
            </div>)}
          
          {/* Value Bet */}
          {((_b = match.nhlPredictions.valueBet) === null || _b === void 0 ? void 0 : _b.detected) && (<div style={{
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    borderRadius: '8px',
                    padding: '10px',
                    marginTop: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
              <div>
                <div style={{ fontSize: '10px', color: '#fff', opacity: 0.9 }}>📌 VALUE BET DÉTECTÉ</div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>
                  {match.nhlPredictions.valueBet.type === 'home' ? match.homeTeam :
                    match.nhlPredictions.valueBet.type === 'away' ? match.awayTeam :
                        (_c = match.nhlPredictions.valueBet.type) === null || _c === void 0 ? void 0 : _c.toUpperCase()}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>
                  +{(match.nhlPredictions.valueBet.edge * 100).toFixed(1)}%
                </div>
                <div style={{ fontSize: '9px', color: '#fff', opacity: 0.8 }}>Edge</div>
              </div>
            </div>)}
          
          {/* Méthodologie badge */}
          <div style={{
                marginTop: '8px',
                padding: '6px',
                background: '#06b6d410',
                borderRadius: '4px',
                border: '1px solid #06b6d430',
                textAlign: 'center'
            }}>
            <span style={{ fontSize: '8px', color: '#06b6d4' }}>
              🧮 Modèle: xG + Corsi + PDO + Forme + Gardien
            </span>
          </div>
        </>)}
    </div>);
}
// Composant API Status Section - Visible pour tous les utilisateurs
function ApiStatusSection() {
    var _this = this;
    var _a, _b, _c, _d, _e, _f;
    var _g = (0, react_1.useState)(null), apiStatus = _g[0], setApiStatus = _g[1];
    var _h = (0, react_1.useState)([]), europaMatches = _h[0], setEuropaMatches = _h[1];
    var _j = (0, react_1.useState)(true), loading = _j[0], setLoading = _j[1];
    var _k = (0, react_1.useState)(false), loadingEuropa = _k[0], setLoadingEuropa = _k[1];
    var _l = (0, react_1.useState)(false), refreshingApi = _l[0], setRefreshingApi = _l[1];
    var _m = (0, react_1.useState)(''), message = _m[0], setMessage = _m[1];
    // Charger le statut API
    var loadApiStatus = function () { return __awaiter(_this, void 0, void 0, function () {
        var res, data, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, 4, 5]);
                    setLoading(true);
                    return [4 /*yield*/, fetch('/api/real-odds')];
                case 1:
                    res = _a.sent();
                    return [4 /*yield*/, res.json()];
                case 2:
                    data = _a.sent();
                    setApiStatus(data);
                    return [3 /*break*/, 5];
                case 3:
                    e_1 = _a.sent();
                    console.error('Erreur chargement statut API:', e_1);
                    setApiStatus({ success: false, message: 'Erreur de connexion' });
                    return [3 /*break*/, 5];
                case 4:
                    setLoading(false);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    // Rafraîchir les cotes
    var refreshOdds = function () { return __awaiter(_this, void 0, void 0, function () {
        var res, data, e_2;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    setRefreshingApi(true);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, 5, 6]);
                    return [4 /*yield*/, fetch('/api/real-odds', { method: 'POST' })];
                case 2:
                    res = _b.sent();
                    return [4 /*yield*/, res.json()];
                case 3:
                    data = _b.sent();
                    setApiStatus(data);
                    setMessage("\u2705 ".concat(((_a = data.matches) === null || _a === void 0 ? void 0 : _a.length) || 0, " matchs mis \u00E0 jour"));
                    setTimeout(function () { return setMessage(''); }, 3000);
                    return [3 /*break*/, 6];
                case 4:
                    e_2 = _b.sent();
                    setMessage('❌ Erreur lors de la mise à jour');
                    return [3 /*break*/, 6];
                case 5:
                    setRefreshingApi(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); };
    // Mettre à jour les matchs européens (ESPN - Gratuit)
    var refreshEuropaMatches = function () { return __awaiter(_this, void 0, void 0, function () {
        var res, data, sourceMsg, e_3;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    setLoadingEuropa(true);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, 5, 6]);
                    return [4 /*yield*/, fetch('/api/europa-update')];
                case 2:
                    res = _b.sent();
                    return [4 /*yield*/, res.json()];
                case 3:
                    data = _b.sent();
                    if (data.success) {
                        setEuropaMatches(data.matches);
                        sourceMsg = ((_a = data.stats) === null || _a === void 0 ? void 0 : _a.source) ? " (".concat(data.stats.source, ")") : '';
                        setMessage("\u2705 ".concat(data.matches.length, " matchs europ\u00E9ens").concat(sourceMsg));
                        setTimeout(function () { return setMessage(''); }, 5000);
                    }
                    else {
                        setMessage('❌ Erreur lors de la récupération');
                    }
                    return [3 /*break*/, 6];
                case 4:
                    e_3 = _b.sent();
                    setMessage('❌ Erreur de connexion');
                    return [3 /*break*/, 6];
                case 5:
                    setLoadingEuropa(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); };
    // Charger au montage
    (0, react_1.useEffect)(function () {
        loadApiStatus();
    }, []);
    return (<div style={{ marginBottom: '12px' }}>
      {/* Titre */}
      <div style={{ marginBottom: '12px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#22c55e', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          📡 API Status
        </h2>
        <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
          Statut des APIs et cotes en temps réel
        </p>
      </div>

      {/* Message de notification */}
      {message && (<div style={{
                background: message.startsWith('✅') ? '#22c55e20' : '#ef444420',
                border: "1px solid ".concat(message.startsWith('✅') ? '#22c55e40' : '#ef444440'),
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '12px',
                color: message.startsWith('✅') ? '#22c55e' : '#ef4444',
                fontSize: '12px'
            }}>
          {message}
        </div>)}

      {/* Section The Odds API - SECONDARY (quota limité) */}
      <div style={{
            background: 'linear-gradient(135deg, #0d1f0d 0%, #1a1a1a 100%)',
            borderRadius: '10px',
            padding: '14px',
            marginBottom: '12px',
            border: '1px solid #f9731630'
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', color: '#f97316', fontWeight: 'bold' }}>The Odds API (Limité)</h3>
              <span style={{ fontSize: '10px', color: '#888' }}>500 crédits/mois - Utilisé uniquement si ESPN ne couvre pas</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={loadApiStatus} disabled={refreshingApi || loading} style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #333',
            background: '#1a1a1a',
            color: '#888',
            cursor: refreshingApi || loading ? 'wait' : 'pointer',
            fontSize: '11px'
        }}>
              {refreshingApi || loading ? '⏳' : '🔄'} Vérifier
            </button>
          </div>
        </div>

        {/* Statut et Quota */}
        {!loading && apiStatus && (<>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              <div style={{ background: '#0a0a0a', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: apiStatus.success ? '#22c55e' : '#ef4444' }}>
                  {apiStatus.success ? '✅' : '❌'}
                </div>
                <div style={{ fontSize: '9px', color: '#888' }}>Statut</div>
              </div>
              <div style={{ background: '#0a0a0a', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: (((_a = apiStatus.quotaInfo) === null || _a === void 0 ? void 0 : _a.remaining) || 0) > 100 ? '#22c55e' : '#f97316' }}>
                  {((_b = apiStatus.quotaInfo) === null || _b === void 0 ? void 0 : _b.remaining) || 0}
                </div>
                <div style={{ fontSize: '9px', color: '#888' }}>Crédits Restants</div>
              </div>
              <div style={{ background: '#0a0a0a', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f97316' }}>
                  {((_c = apiStatus.quotaInfo) === null || _c === void 0 ? void 0 : _c.dailyUsed) || 0}
                </div>
                <div style={{ fontSize: '9px', color: '#888' }}>Req Aujourd'hui</div>
              </div>
              <div style={{ background: '#0a0a0a', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#3b82f6' }}>
                  {((_d = apiStatus.stats) === null || _d === void 0 ? void 0 : _d.active) || ((_e = apiStatus.matches) === null || _e === void 0 ? void 0 : _e.length) || 0}
                </div>
                <div style={{ fontSize: '9px', color: '#888' }}>Matchs</div>
              </div>
            </div>
            {(((_f = apiStatus.quotaInfo) === null || _f === void 0 ? void 0 : _f.remaining) || 0) < 100 && (<div style={{
                    marginTop: '8px',
                    padding: '8px',
                    background: '#f9731620',
                    borderRadius: '6px',
                    fontSize: '10px',
                    color: '#f97316'
                }}>
                ⚠️ Quota faible - Économisez les requêtes ! Utilisez ESPN pour les matchs européens.
              </div>)}
          </>)}

        {loading && (<div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
            ⏳ Chargement...
          </div>)}
      </div>

      {/* Section Compétitions Européennes (ESPN - Gratuit) */}
      <div style={{
            background: 'linear-gradient(135deg, #1a0d1f 0%, #1a1a1a 100%)',
            borderRadius: '10px',
            padding: '14px',
            marginBottom: '12px',
            border: '1px solid #a855f730'
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🏆</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', color: '#a855f7', fontWeight: 'bold' }}>Compétitions Européennes</h3>
              <span style={{ fontSize: '10px', color: '#22c55e' }}>
                📺 ESPN (GRATUIT) • CL + EL + Conference
              </span>
            </div>
          </div>
          <button onClick={refreshEuropaMatches} disabled={loadingEuropa} style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: '1px solid #a855f7',
            background: loadingEuropa ? '#333' : '#a855f7',
            color: '#fff',
            cursor: loadingEuropa ? 'wait' : 'pointer',
            fontSize: '11px',
            fontWeight: 'bold'
        }}>
            {loadingEuropa ? '⏳ Chargement...' : '🔄 Charger Matchs'}
          </button>
        </div>

        {/* Matchs européens */}
        {europaMatches.length > 0 && (<div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
            {europaMatches.slice(0, 10).map(function (match, i) {
                var _a, _b, _c, _d;
                return (<div key={match.id || i} style={{
                        background: '#0a0a0a',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '10px'
                    }}>
                <div>
                  <span style={{ color: '#a855f7', fontWeight: 'bold' }}>[{match.league}]</span>{' '}
                  <span style={{ color: '#fff' }}>{match.homeTeam} vs {match.awayTeam}</span>
                  {match.isLive && (<span style={{
                            background: '#ef4444',
                            color: '#fff',
                            padding: '1px 4px',
                            borderRadius: '2px',
                            fontSize: '8px',
                            marginLeft: '4px'
                        }}>LIVE</span>)}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ color: '#22c55e' }}>{(_a = match.oddsHome) === null || _a === void 0 ? void 0 : _a.toFixed(2)}</span>
                  <span style={{ color: '#888' }}>{((_b = match.oddsDraw) === null || _b === void 0 ? void 0 : _b.toFixed(2)) || '-'}</span>
                  <span style={{ color: '#ef4444' }}>{(_c = match.oddsAway) === null || _c === void 0 ? void 0 : _c.toFixed(2)}</span>
                  {((_d = match.predictions) === null || _d === void 0 ? void 0 : _d.confidence) === 'high' && (<span title="Probabilité ≥ 60% - Recommandé pour les paris sûrs" style={{ background: '#22c55e', color: '#000', padding: '2px 4px', borderRadius: '3px', fontSize: '8px', fontWeight: 'bold', cursor: 'help' }}>
                      HAUTE CONFIANCE
                    </span>)}
                </div>
              </div>);
            })}
            {europaMatches.length > 10 && (<div style={{ textAlign: 'center', color: '#666', fontSize: '10px', padding: '4px' }}>
                +{europaMatches.length - 10} autres matchs
              </div>)}
          </div>)}

        {europaMatches.length === 0 && !loadingEuropa && (<div style={{ textAlign: 'center', color: '#666', fontSize: '11px', padding: '20px' }}>
            Cliquez sur "Charger Matchs CE" pour récupérer les matchs européens
          </div>)}
      </div>

      {/* Section ESPN */}
      <div style={{
            background: 'linear-gradient(135deg, #1a1a0d 0%, #1a1a1a 100%)',
            borderRadius: '10px',
            padding: '14px',
            border: '1px solid #f9731630'
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '18px' }}>📺</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', color: '#f97316', fontWeight: 'bold' }}>ESPN API</h3>
            <span style={{ fontSize: '10px', color: '#888' }}>Scores en direct - Source principale (gratuit)</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ background: '#22c55e20', color: '#22c55e', padding: '4px 8px', borderRadius: '4px', fontSize: '10px' }}>
            ✅ NBA
          </span>
          <span style={{ background: '#22c55e20', color: '#22c55e', padding: '4px 8px', borderRadius: '4px', fontSize: '10px' }}>
            ✅ NHL
          </span>
          <span style={{ background: '#22c55e20', color: '#22c55e', padding: '4px 8px', borderRadius: '4px', fontSize: '10px' }}>
            ✅ Football
          </span>
          <span style={{ background: '#a855f720', color: '#a855f7', padding: '4px 8px', borderRadius: '4px', fontSize: '10px' }}>
            ✅ Champions League
          </span>
          <span style={{ background: '#a855f720', color: '#a855f7', padding: '4px 8px', borderRadius: '4px', fontSize: '10px' }}>
            ✅ Europa League
          </span>
          <span style={{ background: '#a855f720', color: '#a855f7', padding: '4px 8px', borderRadius: '4px', fontSize: '10px' }}>
            ✅ Conference League
          </span>
        </div>
      </div>
    </div>);
}
function TennisSection() {
    var _this = this;
    var _a = (0, react_1.useState)([]), predictions = _a[0], setPredictions = _a[1];
    var _b = (0, react_1.useState)(true), loading = _b[0], setLoading = _b[1];
    var _c = (0, react_1.useState)(null), error = _c[0], setError = _c[1];
    var _d = (0, react_1.useState)('all'), activeFilter = _d[0], setActiveFilter = _d[1];
    var _e = (0, react_1.useState)(new Date()), lastUpdate = _e[0], setLastUpdate = _e[1];
    var _f = (0, react_1.useState)(null), methodology = _f[0], setMethodology = _f[1];
    (0, react_1.useEffect)(function () {
        var fetchTennis = function () { return __awaiter(_this, void 0, void 0, function () {
            var response, data, err_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, 4, 5]);
                        setLoading(true);
                        return [4 /*yield*/, fetch('/api/tennis')];
                    case 1:
                        response = _a.sent();
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = _a.sent();
                        if (data.predictions) {
                            setPredictions(data.predictions);
                        }
                        if (data.stats) {
                            setStats(data.stats);
                        }
                        if (data.methodology) {
                            setMethodology(data.methodology);
                        }
                        setLastUpdate(new Date());
                        setError(null);
                        return [3 /*break*/, 5];
                    case 3:
                        err_2 = _a.sent();
                        setError('Erreur lors du chargement des matchs de tennis');
                        return [3 /*break*/, 5];
                    case 4:
                        setLoading(false);
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        }); };
        fetchTennis();
        var interval = setInterval(fetchTennis, 5 * 60 * 1000);
        return function () { return clearInterval(interval); };
    }, []);
    var _g = (0, react_1.useState)(null), stats = _g[0], setStats = _g[1];
    var filteredPredictions = activeFilter === 'recommended'
        ? predictions.filter(function (p) { return p.betting.recommendedBet; })
        : activeFilter === 'atp'
            ? predictions.filter(function (p) { return p.category === 'atp'; })
            : activeFilter === 'wta'
                ? predictions.filter(function (p) { return p.category === 'wta'; })
                : predictions;
    var surfaceColors = {
        hard: '#3b82f6',
        clay: '#f97316',
        grass: '#22c55e',
        carpet: '#8b5cf6'
    };
    var surfaceLabels = {
        hard: 'Dur',
        clay: 'Terre battue',
        grass: 'Gazon',
        carpet: 'Indoor'
    };
    var confidenceColors = {
        very_high: '#22c55e',
        high: '#84cc16',
        medium: '#eab308',
        low: '#ef4444'
    };
    var confidenceLabels = {
        very_high: 'Très haute',
        high: 'Haute',
        medium: 'Moyenne',
        low: 'Faible'
    };
    var categoryColors = {
        atp: '#22c55e',
        wta: '#f97316',
        challenger: '#3b82f6',
        itf: '#8b5cf6'
    };
    return (<div style={{ marginBottom: '12px' }}>
      {/* Header */}
      <div style={{ marginBottom: '12px' }}>
        <h2 style={{
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#a855f7',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }}>
          <span style={{
            fontSize: '20px',
            filter: 'drop-shadow(0 2px 4px rgba(168, 85, 247, 0.3))'
        }}>🎾</span>
          Tennis - Prédictions ML
        </h2>
        <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
          ATP & WTA - Analyses basées sur surface, forme et cotes réelles
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <p style={{ color: '#666', fontSize: '10px' }}>
            Mise à jour: {lastUpdate.toLocaleTimeString('fr-FR')} • {predictions.length} matchs
          </p>
        </div>
      </div>

      {/* Stats */}
      {stats && (<div style={{
                background: 'linear-gradient(135deg, #1a1a2a 0%, #2a1a3a 100%)',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px',
                border: '1px solid #a855f730'
            }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#a855f7' }}>{stats.total}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>Total</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#22c55e' }}>{stats.atp}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>ATP</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f97316' }}>{stats.wta}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>WTA</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#3b82f6' }}>{stats.challenger || 0}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>Challenger</div>
            </div>
          </div>
          
          {/* Stats par surface */}
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #333' }}>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px' }}>Surface des tournois</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Object.entries(stats.bySurface).map(function (_a) {
                var surface = _a[0], count = _a[1];
                return (<span key={surface} style={{
                        background: "".concat(surfaceColors[surface], "20"),
                        color: surfaceColors[surface],
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontWeight: 'bold'
                    }}>
                  {surfaceLabels[surface]}: {count}
                </span>);
            })}
            </div>
          </div>
          
          {/* Confiance */}
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #333' }}>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px' }}>Niveau de confiance</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Object.entries(stats.byConfidence).map(function (_a) {
                var conf = _a[0], count = _a[1];
                return (<span key={conf} style={{
                        background: "".concat(confidenceColors[conf], "20"),
                        color: confidenceColors[conf],
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontWeight: 'bold'
                    }}>
                  {confidenceLabels[conf]}: {count}
                </span>);
            })}
            </div>
          </div>
        </div>)}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <button onClick={function () { return setActiveFilter('all'); }} style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: activeFilter === 'all' ? '1px solid #a855f7' : '1px solid #333',
            background: activeFilter === 'all' ? '#a855f7' : 'transparent',
            color: activeFilter === 'all' ? '#fff' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeFilter === 'all' ? 'bold' : 'normal'
        }}>
          🎾 Tous ({predictions.length})
        </button>
        <button onClick={function () { return setActiveFilter('atp'); }} style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: activeFilter === 'atp' ? '1px solid #22c55e' : '1px solid #333',
            background: activeFilter === 'atp' ? '#22c55e' : 'transparent',
            color: activeFilter === 'atp' ? '#fff' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeFilter === 'atp' ? 'bold' : 'normal'
        }}>
          👨 ATP ({(stats === null || stats === void 0 ? void 0 : stats.atp) || 0})
        </button>
        <button onClick={function () { return setActiveFilter('wta'); }} style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: activeFilter === 'wta' ? '1px solid #f97316' : '1px solid #333',
            background: activeFilter === 'wta' ? '#f97316' : 'transparent',
            color: activeFilter === 'wta' ? '#fff' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeFilter === 'wta' ? 'bold' : 'normal'
        }}>
          👩 WTA ({(stats === null || stats === void 0 ? void 0 : stats.wta) || 0})
        </button>
        <button onClick={function () { return setActiveFilter('recommended'); }} style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: activeFilter === 'recommended' ? '1px solid #22c55e' : '1px solid #333',
            background: activeFilter === 'recommended' ? '#22c55e' : 'transparent',
            color: activeFilter === 'recommended' ? '#fff' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeFilter === 'recommended' ? 'bold' : 'normal'
        }}>
          💰 Recommandés ({(stats === null || stats === void 0 ? void 0 : stats.recommendedBets) || 0})
        </button>
      </div>

      {/* Loading */}
      {loading ? (<div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
          <span style={{ fontSize: '12px' }}>Chargement Tennis...</span>
        </div>) : error ? (<div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>❌</div>
          <span style={{ fontSize: '12px' }}>{error}</span>
        </div>) : filteredPredictions.length === 0 ? (<div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎾</div>
          <span style={{ fontSize: '12px' }}>Aucun match de tennis prévu</span>
        </div>) : (<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredPredictions.map(function (prediction, idx) { return (<TennisPredictionCard key={prediction.matchId} prediction={prediction} index={idx + 1} surfaceColors={surfaceColors} surfaceLabels={surfaceLabels} confidenceColors={confidenceColors} confidenceLabels={confidenceLabels}/>); })}
        </div>)}
    </div>);
}
// Tennis Prediction Card Component  
function TennisPredictionCard(_a) {
    var _b, _c;
    var prediction = _a.prediction, index = _a.index, surfaceColors = _a.surfaceColors, surfaceLabels = _a.surfaceLabels, confidenceColors = _a.confidenceColors, confidenceLabels = _a.confidenceLabels;
    var _d = (0, react_1.useState)(false), expanded = _d[0], setExpanded = _d[1];
    var pred = prediction.prediction;
    var isPlayer1Favorite = prediction.odds1 < prediction.odds2;
    var predictedPlayer = pred.winner === 'player1' ? prediction.player1 : prediction.player2;
    var winnerOdds = pred.winner === 'player1' ? prediction.odds1 : prediction.odds2;
    var confidenceColor = confidenceColors[pred.confidence] || '#eab308';
    var confidenceLabel = confidenceLabels[pred.confidence] || 'Moyenne';
    return (<div style={{
            background: 'linear-gradient(135deg, #1a1a2a 0%, #0a0a0a 100%)',
            borderRadius: '12px',
            padding: '14px',
            border: false ? '1px solid #ef444450' : '1px solid #a855f730',
            boxShadow: '0 4px 20px rgba(168, 85, 247, 0.1)'
        }}>
      {/* Header */}
      <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            background: '#a855f7',
            color: '#fff',
            width: '26px',
            height: '26px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold'
        }}>{index}</span>
          <span style={{
            fontSize: '9px',
            color: surfaceColors[prediction.surface],
            background: "".concat(surfaceColors[prediction.surface], "20"),
            padding: '2px 6px',
            borderRadius: '4px',
            fontWeight: 'bold'
        }}>
            {surfaceLabels[prediction.surface]}
          </span>
          {false && (<span style={{
                background: '#ef4444',
                color: '#fff',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '9px',
                fontWeight: 'bold',
                animation: 'pulse 1s infinite'
            }}>LIVE</span>)}
          {false && (<span style={{
                background: '#22c55e',
                color: '#fff',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '9px',
                fontWeight: 'bold'
            }}>TERMINÉ</span>)}
        </div>
        <span style={{
            background: '#1a1a1a',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            color: prediction.tournament.includes('ATP') ? '#22c55e' : '#f97316'
        }}>
          {prediction.tournament}
        </span>
      </div>

      {/* Players */}
      <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
            padding: '10px',
            background: '#111',
            borderRadius: '10px'
        }}>
        {/* Player 1 */}
        <div style={{
            flex: 1,
            textAlign: 'center',
            padding: '8px',
            borderRadius: '8px',
            background: isPlayer1Favorite ? 'linear-gradient(135deg, #a855f720 0%, #a855f710 100%)' : 'transparent',
            border: isPlayer1Favorite ? '2px solid #a855f7' : '2px solid transparent'
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 'bold',
            color: isPlayer1Favorite ? '#a855f7' : '#fff',
            marginBottom: '4px'
        }}>
            {isPlayer1Favorite && '⭐ '}{prediction.player1}
          </div>
          <div style={{ fontSize: '10px', color: '#888' }}>
            Cote: <span style={{ color: '#a855f7', fontWeight: 'bold' }}>{((_b = prediction.odds1) === null || _b === void 0 ? void 0 : _b.toFixed(2)) || '1.85'}</span>
          </div>
        </div>
        
        {/* VS */}
        <div style={{ padding: '0 10px' }}>
          <div style={{
            fontSize: '10px',
            color: '#666',
            background: '#1a1a1a',
            padding: '6px 10px',
            borderRadius: '6px'
        }}>
            VS
          </div>
        </div>
        
        {/* Player 2 */}
        <div style={{
            flex: 1,
            textAlign: 'center',
            padding: '8px',
            borderRadius: '8px',
            background: !isPlayer1Favorite ? 'linear-gradient(135deg, #3b82f620 0%, #3b82f610 100%)' : 'transparent',
            border: !isPlayer1Favorite ? '2px solid #3b82f6' : '2px solid transparent'
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 'bold',
            color: !isPlayer1Favorite ? '#3b82f6' : '#fff',
            marginBottom: '4px'
        }}>
            {!isPlayer1Favorite && '⭐ '}{prediction.player2}
          </div>
          <div style={{ fontSize: '10px', color: '#888' }}>
            Cote: <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>{((_c = prediction.odds2) === null || _c === void 0 ? void 0 : _c.toFixed(2)) || '1.85'}</span>
          </div>
        </div>
      </div>

      {/* Prédiction */}
      <div style={{
            background: 'linear-gradient(135deg, #1a1a2a 0%, #0a0a0a 100%)',
            borderRadius: '8px',
            padding: '10px',
            marginBottom: '10px',
            border: '1px solid #a855f720'
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>🏆 VAINQUEUR PRÉDIT</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#a855f7' }}>
              ⭐ {predictedPlayer}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
            background: "".concat(confidenceColor, "20"),
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            color: confidenceColor,
            fontWeight: 'bold'
        }}>
              {confidenceLabel}
            </div>
            <div style={{ fontSize: '9px', color: '#666', marginTop: '4px' }}>
              Probabilité: {pred.winProbability}% • Risque: {pred.riskPercentage}%
            </div>
          </div>
        </div>
        
        {/* Betting info */}
        {prediction.betting.recommendedBet && (<div style={{
                marginTop: '8px',
                padding: '8px',
                background: '#22c55e15',
                borderRadius: '6px',
                border: '1px solid #22c55e30'
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 'bold' }}>💰 Paris recommandé</span>
              <span style={{ fontSize: '10px', color: '#888' }}>Kelly: {prediction.betting.kellyStake}%</span>
            </div>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
              Cote: {winnerOdds.toFixed(2)} • VE: {prediction.betting.expectedValue > 0 ? '+' : ''}{prediction.betting.expectedValue}%
            </div>
          </div>)}
      </div>

      {/* Key Factors */}
      {prediction.keyFactors.length > 0 && (<div style={{ marginBottom: '10px' }}>
          {prediction.keyFactors.map(function (factor, i) { return (<span key={i} style={{
                    display: 'inline-block',
                    background: '#a855f720',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    color: '#a855f7',
                    marginRight: '4px',
                    marginBottom: '4px'
                }}>{factor}</span>); })}
        </div>)}

      {/* Warnings */}
      {prediction.warnings.length > 0 && expanded && (<div style={{ marginBottom: '10px', padding: '8px', background: '#ef444410', borderRadius: '6px' }}>
          {prediction.warnings.map(function (warning, i) { return (<div key={i} style={{ fontSize: '9px', color: '#ef4444' }}>⚠️ {warning}</div>); })}
        </div>)}

      {/* Tournoi info */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#666' }}>
        <span>📍 {prediction.tournament} • {prediction.round}</span>
        <span>🕐 {new Date(prediction.date).toLocaleDateString('fr-FR')}</span>
      </div>
    </div>);
}
// ===== SECTION FOOTBALL =====
function FootballSection(_a) {
    var matches = _a.matches, loading = _a.loading, lastUpdate = _a.lastUpdate;
    var _b = (0, react_1.useState)('all'), activeTab = _b[0], setActiveTab = _b[1];
    // Catégoriser les matchs
    var now = new Date();
    var getMatchStatus = function (match) {
        var matchDate = new Date(match.date);
        var matchDurationMs = 2 * 60 * 60 * 1000;
        var matchEndTime = new Date(matchDate.getTime() + matchDurationMs);
        if (now < matchDate)
            return 'upcoming';
        if (now >= matchDate && now <= matchEndTime)
            return 'live';
        return 'finished';
    };
    var upcomingMatches = matches.filter(function (m) { return getMatchStatus(m) === 'upcoming'; });
    var liveMatches = matches.filter(function (m) { return getMatchStatus(m) === 'live' || m.isLive; });
    var finishedMatches = matches.filter(function (m) { return getMatchStatus(m) === 'finished' || m.isFinished; });
    var activeMatches = __spreadArray(__spreadArray([], upcomingMatches, true), liveMatches, true);
    // Categoriser avec fallback pour les matchs sans insight
    var safes = activeMatches.filter(function (m) {
        var _a, _b;
        var risk = (_b = (_a = m.insight) === null || _a === void 0 ? void 0 : _a.riskPercentage) !== null && _b !== void 0 ? _b : 50;
        return risk <= 40;
    });
    var moderate = activeMatches.filter(function (m) {
        var _a, _b;
        var risk = (_b = (_a = m.insight) === null || _a === void 0 ? void 0 : _a.riskPercentage) !== null && _b !== void 0 ? _b : 50;
        return risk > 40 && risk <= 55;
    });
    var risky = activeMatches.filter(function (m) {
        var _a, _b;
        var risk = (_b = (_a = m.insight) === null || _a === void 0 ? void 0 : _a.riskPercentage) !== null && _b !== void 0 ? _b : 50;
        return risk > 55;
    });
    var displayedMatches = activeTab === 'safes' ? safes
        : activeTab === 'moderate' ? moderate
            : activeTab === 'risky' ? risky
                : activeTab === 'live' ? liveMatches
                    : activeTab === 'finished' ? finishedMatches
                        : activeMatches;
    return (<div style={{ marginBottom: '12px' }}>
      {/* Header */}
      <div style={{ marginBottom: '12px' }}>
        <h2 style={{
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#22c55e',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }}>
          ⚽ Football - Pronostics du Jour
        </h2>
        <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
          Modèle Dixon-Coles amélioré • 10 matchs max • Analyse valeur
        </p>
        <p style={{ color: '#666', fontSize: '10px' }}>
          Mise à jour: {lastUpdate.toLocaleTimeString('fr-FR')} • {safes.length} sûrs, {moderate.length} modérés, {risky.length} risqués
        </p>
        
        {/* Plages horaires Football */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
          <div style={{ padding: '4px 8px', background: '#22c55e15', borderRadius: '6px', fontSize: '10px' }}>
            <span style={{ color: '#22c55e' }}>⚽ Ligues 10h-22h UTC</span>
          </div>
          <div style={{ padding: '4px 8px', background: '#8b5cf615', borderRadius: '6px', fontSize: '10px' }}>
            <span style={{ color: '#8b5cf6' }}>🏆 LDC/Europa 20h45 UTC</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'nowrap', overflowX: 'auto' }}>
        <TabButtonCompact active={activeTab === 'all'} onClick={function () { return setActiveTab('all'); }} icon="📋" label="Tous" count={activeMatches.length}/>
        <TabButtonCompact active={activeTab === 'safes'} onClick={function () { return setActiveTab('safes'); }} icon="🛡️" label="Sûrs" count={safes.length}/>
        <TabButtonCompact active={activeTab === 'moderate'} onClick={function () { return setActiveTab('moderate'); }} icon="⚠️" label="Modérés" count={moderate.length}/>
        <TabButtonCompact active={activeTab === 'risky'} onClick={function () { return setActiveTab('risky'); }} icon="🎯" label="Risqués" count={risky.length}/>
        <TabButtonCompact active={activeTab === 'live'} onClick={function () { return setActiveTab('live'); }} icon="🔴" label="Live" count={liveMatches.length} isLive/>
        <TabButtonCompact active={activeTab === 'finished'} onClick={function () { return setActiveTab('finished'); }} icon="✅" label="Terminés" count={finishedMatches.length}/>
      </div>

      {/* Matchs */}
      {loading ? (<div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
          <span style={{ fontSize: '12px' }}>Chargement Football...</span>
        </div>) : displayedMatches.length === 0 ? (<div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚽</div>
          <span style={{ fontSize: '12px' }}>Aucun match de football</span>
        </div>) : (<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {displayedMatches.slice(0, 10).map(function (match, index) { return (<MatchCardCompact key={match.id} match={match} index={index + 1}/>); })}
        </div>)}
    </div>);
}
// ===== SECTION BASKETBALL =====
function BasketballSection(_a) {
    var matches = _a.matches, loading = _a.loading, lastUpdate = _a.lastUpdate;
    var _b = (0, react_1.useState)('safes'), activeTab = _b[0], setActiveTab = _b[1];
    // Vérifier créneau horaire NBA
    var hour = new Date().getUTCHours();
    var isNBATime = [0, 1, 2, 3, 19, 20, 21, 22, 23].includes(hour);
    var now = new Date();
    var liveMatches = matches.filter(function (m) { return m.isLive; });
    var finishedMatches = matches.filter(function (m) { return m.isFinished; });
    var upcomingMatches = matches.filter(function (m) { return !m.isLive && !m.isFinished; });
    var safes = upcomingMatches.filter(function (m) { var _a; return ((_a = m.insight) === null || _a === void 0 ? void 0 : _a.riskPercentage) !== undefined && m.insight.riskPercentage <= 45; });
    var displayedMatches = activeTab === 'safes' ? safes
        : activeTab === 'live' ? liveMatches
            : activeTab === 'finished' ? finishedMatches
                : matches;
    if (!isNBATime && matches.filter(function (m) { return !m.isFinished; }).length === 0) {
        return (<div style={{ marginBottom: '12px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#f97316', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🏀 Basketball NBA
        </h2>
        <div style={{
                background: '#f9731615',
                borderRadius: '10px',
                padding: '20px',
                textAlign: 'center',
                border: '1px solid #f9731630'
            }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>⏰</div>
          <p style={{ color: '#f97316', fontWeight: 'bold', marginBottom: '4px' }}>Hors créneau NBA</p>
          <p style={{ color: '#888', fontSize: '11px' }}>
            Les matchs NBA apparaissent de 00h-03h et 19h-23h UTC
          </p>
          <p style={{ color: '#666', fontSize: '10px', marginTop: '8px' }}>
            Prochaine session: {hour < 19 ? '19h00 UTC' : '00h00 UTC'}
          </p>
        </div>
      </div>);
    }
    return (<div style={{ marginBottom: '12px' }}>
      {/* Header */}
      <div style={{ marginBottom: '12px' }}>
        <h2 style={{
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#f97316',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }}>
          🏀 Basketball NBA - Pronostics
        </h2>
        <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
          Modèle prédictif NBA • 6 matchs max • Spread & Total Points
        </p>
        <p style={{ color: '#666', fontSize: '10px' }}>
          Mise à jour: {lastUpdate.toLocaleTimeString('fr-FR')} • {matches.length} matchs • Créneau: 00h-03h, 19h-23h UTC
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'nowrap', overflowX: 'auto' }}>
        <TabButtonCompact active={activeTab === 'safes'} onClick={function () { return setActiveTab('safes'); }} icon="🛡️" label="Sûrs" count={safes.length}/>
        <TabButtonCompact active={activeTab === 'live'} onClick={function () { return setActiveTab('live'); }} icon="🔴" label="Live" count={liveMatches.length} isLive/>
        <TabButtonCompact active={activeTab === 'finished'} onClick={function () { return setActiveTab('finished'); }} icon="✅" label="Terminés" count={finishedMatches.length}/>
        <TabButtonCompact active={activeTab === 'all'} onClick={function () { return setActiveTab('all'); }} icon="📋" label="Tous" count={matches.length}/>
      </div>

      {/* Matchs */}
      {loading ? (<div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
          <span style={{ fontSize: '12px' }}>Chargement NBA...</span>
        </div>) : displayedMatches.length === 0 ? (<div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🏀</div>
          <span style={{ fontSize: '12px' }}>Aucun match NBA disponible</span>
        </div>) : (<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {displayedMatches.slice(0, 6).map(function (match, index) { return (<MatchCardCompact key={match.id} match={match} index={index + 1}/>); })}
        </div>)}
    </div>);
}
function AppDashboard(_a) {
    var _this = this;
    var onLogout = _a.onLogout, userInfo = _a.userInfo;
    var _b = (0, react_1.useState)([]), matches = _b[0], setMatches = _b[1];
    var _c = (0, react_1.useState)(true), loading = _c[0], setLoading = _c[1];
    var _d = (0, react_1.useState)('safes'), activeTab = _d[0], setActiveTab = _d[1];
    var _e = (0, react_1.useState)(new Date()), lastUpdate = _e[0], setLastUpdate = _e[1];
    var _f = (0, react_1.useState)('loading'), apiStatus = _f[0], setApiStatus = _f[1];
    var _g = (0, react_1.useState)('football'), activeSection = _g[0], setActiveSection = _g[1];
    var _h = (0, react_1.useState)({
        currentHour: new Date().getHours(),
        canRefresh: true,
        nextRefreshTime: 'Maintenant',
        currentPhase: 'afternoon',
        message: ''
    }), timing = _h[0], setTiming = _h[1];
    // Timer de session (20 minutes max)
    var SESSION_DURATION = 20 * 60; // 20 minutes en secondes
    var _j = (0, react_1.useState)(SESSION_DURATION), sessionTimeLeft = _j[0], setSessionTimeLeft = _j[1];
    var _k = (0, react_1.useState)(false), showSessionWarning = _k[0], setShowSessionWarning = _k[1];
    // Vérifier si le compte expire bientôt (moins de 7 jours)
    var isExpiringSoon = (userInfo === null || userInfo === void 0 ? void 0 : userInfo.daysRemaining) !== undefined && userInfo.daysRemaining <= 7 && userInfo.role === 'user';
    // Fonction pour sauvegarder les pronostics en base (déclarée avant utilisation)
    var savePredictionsToDB = function (matchList) { return __awaiter(_this, void 0, void 0, function () {
        var predictions, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    predictions = matchList
                        .filter(function (m) { return m && m.insight; }) // Filtrer les matchs sans insight
                        .map(function (m) {
                        var _a, _b, _c;
                        return ({
                            matchId: m.id,
                            homeTeam: m.homeTeam,
                            awayTeam: m.awayTeam,
                            league: m.league,
                            sport: m.sport,
                            matchDate: m.date,
                            oddsHome: m.oddsHome,
                            oddsDraw: m.oddsDraw,
                            oddsAway: m.oddsAway,
                            predictedResult: m.oddsHome < m.oddsAway ? 'home' : 'away',
                            predictedGoals: ((_a = m.goalsPrediction) === null || _a === void 0 ? void 0 : _a.prediction) || null,
                            confidence: ((_b = m.insight) === null || _b === void 0 ? void 0 : _b.confidence) || 'medium',
                            riskPercentage: ((_c = m.insight) === null || _c === void 0 ? void 0 : _c.riskPercentage) || 50
                        });
                    });
                    if (predictions.length === 0)
                        return [2 /*return*/];
                    return [4 /*yield*/, fetch('/api/results', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                action: 'save_predictions',
                                predictions: predictions
                            })
                        })];
                case 1:
                    _a.sent();
                    console.log('💾 Pronostics sauvegardés en base');
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _a.sent();
                    console.error('Erreur sauvegarde pronostics:', error_1);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); };
    // Timer de session - décompte 20 min
    (0, react_1.useEffect)(function () {
        var timer = setInterval(function () {
            setSessionTimeLeft(function (prev) {
                if (prev <= 1) {
                    // Session expirée - déconnexion auto
                    onLogout();
                    return 0;
                }
                if (prev <= 60) {
                    setShowSessionWarning(true); // Warning à 1 minute
                }
                return prev - 1;
            });
        }, 1000);
        return function () { return clearInterval(timer); };
    }, []);
    // Formater le temps restant
    var formatTime = function (seconds) {
        var mins = Math.floor(seconds / 60);
        var secs = seconds % 60;
        return "".concat(mins, ":").concat(secs.toString().padStart(2, '0'));
    };
    // Charger les matchs - CHARGEMENT IMMÉDIAT + refresh toutes les 5 min
    (0, react_1.useEffect)(function () {
        var isMounted = true;
        var refreshInterval;
        var fetchMatches = function (forceRefresh) {
            if (forceRefresh === void 0) { forceRefresh = false; }
            var url = forceRefresh ? '/api/matches?refresh=true' : '/api/matches';
            fetch(url)
                .then(function (res) {
                if (isMounted) {
                    setApiStatus(res.ok ? 'online' : 'offline');
                }
                return res.json();
            })
                .then(function (data) {
                if (isMounted) {
                    var matchList = data.matches || data;
                    setMatches(matchList);
                    if (data.timing) {
                        setTiming(data.timing);
                    }
                    setLastUpdate(new Date());
                    setLoading(false);
                    // Sauvegarder automatiquement les pronostics
                    if (matchList && matchList.length > 0) {
                        savePredictionsToDB(matchList);
                    }
                }
            })
                .catch(function () {
                if (isMounted) {
                    setApiStatus('offline');
                    setLoading(false);
                }
            });
        };
        // Chargement initial - FORCER le refresh
        fetchMatches(true);
        // Auto-refresh toutes les 5 minutes (pas de force)
        refreshInterval = setInterval(function () { return fetchMatches(false); }, 5 * 60 * 1000);
        return function () {
            isMounted = false;
            clearInterval(refreshInterval);
        };
    }, []);
    var handleRefresh = function () {
        if (!timing.canRefresh)
            return;
        setLoading(true);
        fetch('/api/matches?refresh=true')
            .then(function (res) { return res.json(); })
            .then(function (data) {
            setMatches(data.matches || data);
            if (data.timing) {
                setTiming(data.timing);
            }
            setLastUpdate(new Date());
            setLoading(false);
            // Sauvegarder automatiquement les pronostics du jour
            if (data.matches && data.matches.length > 0) {
                savePredictionsToDB(data.matches);
            }
        })
            .catch(function () { return setLoading(false); });
    };
    // Séparer les matchs selon leur statut réel
    // Un match est en cours si: heure actuelle est entre début et début + durée
    // Football: 2h, Basketball: 2.5h
    var now = new Date();
    var getMatchStatus = function (match) {
        var matchDate = new Date(match.date);
        var matchDurationMs = match.sport === 'Basket' ? 2.5 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000; // 2.5h ou 2h
        var matchEndTime = new Date(matchDate.getTime() + matchDurationMs);
        if (now < matchDate)
            return 'upcoming';
        if (now >= matchDate && now <= matchEndTime)
            return 'live';
        return 'finished';
    };
    // Catégoriser les matchs
    var upcomingMatches = matches.filter(function (m) { return getMatchStatus(m) === 'upcoming'; });
    var liveMatches = matches.filter(function (m) { return getMatchStatus(m) === 'live'; });
    var finishedMatches = matches.filter(function (m) { return getMatchStatus(m) === 'finished'; });
    // Filtrer les matchs à venir ET en cours pour les pronostics
    var activeMatches = __spreadArray(__spreadArray([], upcomingMatches, true), liveMatches, true);
    var safes = activeMatches.filter(function (m) { var _a; return ((_a = m.insight) === null || _a === void 0 ? void 0 : _a.riskPercentage) !== undefined && m.insight.riskPercentage <= 40; });
    var moderate = activeMatches.filter(function (m) { var _a; return ((_a = m.insight) === null || _a === void 0 ? void 0 : _a.riskPercentage) !== undefined && m.insight.riskPercentage > 40 && m.insight.riskPercentage <= 50; });
    var risky = activeMatches.filter(function (m) { var _a; return ((_a = m.insight) === null || _a === void 0 ? void 0 : _a.riskPercentage) !== undefined && m.insight.riskPercentage > 50; });
    var valueBets = activeMatches.filter(function (m) { var _a; return ((_a = m.insight) === null || _a === void 0 ? void 0 : _a.valueBetDetected) === true; });
    // Matchs à afficher selon l'onglet
    var displayedMatches = activeTab === 'safes' ? safes
        : activeTab === 'moderate' ? moderate
            : activeTab === 'risky' ? risky
                : activeTab === 'live' ? liveMatches
                    : activeTab === 'finished' ? finishedMatches
                        : matches;
    return (<div style={{
            minHeight: '100vh',
            background: '#0a0a0a',
            color: '#fff',
            display: 'flex'
        }}>
      {/* Sidebar - Menu Vertical */}
      <aside style={{
            width: '70px',
            minWidth: '70px',
            background: '#111',
            borderRight: '1px solid #222',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '12px 0',
            gap: '4px',
            position: 'sticky',
            top: 0,
            height: '100vh'
        }}>
        {/* Logo */}
        <div style={{
            padding: '6px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            marginBottom: '8px'
        }}>
          <span style={{ fontSize: '18px' }}>👑</span>
        </div>
        
        {/* Timer de session */}
        <div style={{
            fontSize: '10px',
            color: sessionTimeLeft <= 60 ? '#ef4444' : sessionTimeLeft <= 300 ? '#f97316' : '#666',
            fontFamily: 'monospace',
            marginBottom: '8px',
            textAlign: 'center'
        }}>
          ⏱️ {formatTime(sessionTimeLeft)}
        </div>
        
        {/* Menu Items - Séparés par Sport */}
        <NavButton icon="⚽" label="Football" active={activeSection === 'football'} onClick={function () { return setActiveSection('football'); }} color="#22c55e"/>
        <NavButton icon="🏀" label="Basket" active={activeSection === 'basketball'} onClick={function () { return setActiveSection('basketball'); }} color="#f97316"/>
        <NavButton icon="🏈" label="NFL" active={activeSection === 'nfl'} onClick={function () { return setActiveSection('nfl'); }} color="#3b82f6"/>
        <NavButton icon="🏒" label="NHL" active={activeSection === 'nhl'} onClick={function () { return setActiveSection('nhl'); }} color="#06b6d4"/>
        <NavButton icon="🎾" label="Tennis" active={activeSection === 'tennis'} onClick={function () { return setActiveSection('tennis'); }} color="#a855f7"/>
        {/* Expert ML - MASQUÉ en mode apprentissage jusqu'à 70% de réussite sur 7 jours */}
        {/* <NavButton icon="🎯" label="Expert ML" active={activeSection === 'expert'} onClick={() => setActiveSection('expert')} color="#14b8a6" /> */}
        <NavButton icon="🔍" label="Analyse" active={activeSection === 'analyse'} onClick={function () { return setActiveSection('analyse'); }} color="#8b5cf6"/>
        <NavButton icon="🛡️" label="Trap" active={activeSection === 'antitrap'} onClick={function () { return setActiveSection('antitrap'); }} color="#ef4444"/>
        <NavButton icon="📊" label="Stats" active={activeSection === 'results'} onClick={function () { return setActiveSection('results'); }} color="#eab308"/>
        <NavButton icon="💰" label="Bank" active={activeSection === 'bankroll'} onClick={function () { return setActiveSection('bankroll'); }} color="#22c55e"/>
        
        {/* API Status - Visible uniquement pour les admins */}
        {(userInfo === null || userInfo === void 0 ? void 0 : userInfo.role) === 'admin' && (<NavButton icon="📡" label="API" active={activeSection === 'apistatus'} onClick={function () { return setActiveSection('apistatus'); }} color="#22c55e"/>)}
        
        {/* Pronostiqueur Pro - Visible uniquement pour les admins */}
        {(userInfo === null || userInfo === void 0 ? void 0 : userInfo.role) === 'admin' && (<NavButton icon="🎯" label="Pro" active={activeSection === 'pronostiqueur'} onClick={function () { return setActiveSection('pronostiqueur'); }} color="#f97316"/>)}
        
        {/* Admin Button - Visible uniquement pour les admins */}
        {(userInfo === null || userInfo === void 0 ? void 0 : userInfo.role) === 'admin' && (<NavButton icon="⚙️" label="Admin" active={activeSection === 'admin'} onClick={function () { return setActiveSection('admin'); }} color="#eab308"/>)}
        
        {/* Spacer */}
        <div style={{ flex: 1 }}></div>
        
        {/* API Status */}
        <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: apiStatus === 'online' ? '#22c55e' : '#ef4444',
            boxShadow: apiStatus === 'online' ? '0 0 6px #22c55e' : 'none'
        }} title={apiStatus === 'online' ? 'API En ligne' : 'API Hors ligne'}></div>
        
        {/* Logout */}
        <button onClick={onLogout} style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            border: '1px solid #ef444440',
            background: 'transparent',
            color: '#ef4444',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px'
        }} title="Se déconnecter">
          🚪
        </button>
      </aside>

      {/* Warning Modal - Session expire dans 1 min */}
      {showSessionWarning && (<div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
            }}>
          <div style={{
                background: '#1a1a1a',
                padding: '24px',
                borderRadius: '12px',
                textAlign: 'center',
                border: '1px solid #ef4444'
            }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
            <h3 style={{ color: '#ef4444', marginBottom: '8px' }}>Session expire bientôt</h3>
            <p style={{ color: '#888', marginBottom: '16px' }}>
              Déconnexion dans <strong style={{ color: '#ef4444' }}>{formatTime(sessionTimeLeft)}</strong>
            </p>
            <button onClick={function () {
                setSessionTimeLeft(SESSION_DURATION);
                setShowSessionWarning(false);
            }} style={{
                padding: '10px 24px',
                borderRadius: '8px',
                border: 'none',
                background: '#f97316',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 'bold'
            }}>
              Prolonger la session
            </button>
          </div>
        </div>)}

      {/* Main Content */}
      <main style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {/* Alerte expiration compte */}
        {isExpiringSoon && (<div style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '12px' }}>
                Compte expire dans {userInfo === null || userInfo === void 0 ? void 0 : userInfo.daysRemaining} jour{(userInfo === null || userInfo === void 0 ? void 0 : userInfo.daysRemaining) !== 1 ? 's' : ''}
              </div>
              <div style={{ color: '#888', fontSize: '10px' }}>
                Contactez l'administrateur pour prolonger votre accès
              </div>
            </div>
          </div>)}

        {/* Header compact */}
        <header style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '8px'
        }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#f97316', margin: 0 }}>
              Steo Élite Predictor
            </h1>
            <span style={{ fontSize: '11px', color: '#666' }}>
              {timing.currentPhase === 'morning' ? '🌅' : timing.currentPhase === 'afternoon' ? '☀️' : '🌙'} {matches.length} matchs
            </span>
          </div>
          <span style={{
            fontSize: '11px',
            color: apiStatus === 'online' ? '#22c55e' : '#ef4444'
        }}>
            {apiStatus === 'online' ? '✓ API' : '✗ Offline'}
          </span>
        </header>

        {/* Section Football */}
        {activeSection === 'football' && (<FootballSection matches={matches.filter(function (m) { return m.sport === 'Foot' || m.sport === 'Football'; })} loading={loading} lastUpdate={lastUpdate}/>)}

        {/* Section Basketball */}
        {activeSection === 'basketball' && (<BasketballSection matches={matches.filter(function (m) { return m.sport === 'Basket' || m.sport === 'Basketball'; })} loading={loading} lastUpdate={lastUpdate}/>)}

        {/* Section Analyse de Match */}
        {activeSection === 'analyse' && (<div style={{ marginBottom: '12px' }}>
            <div style={{ marginBottom: '12px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#3b82f6', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🔍 Analyse de Match
              </h2>
              <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
                Analysez un match avec nos prédictions détaillées (3 analyses/jour)
              </p>
            </div>
            <MatchAnalysisSection username={(userInfo === null || userInfo === void 0 ? void 0 : userInfo.username) || ''} matches={matches}/>
          </div>)}

        {/* Section Anti-Trap */}
        {activeSection === 'antitrap' && (<div style={{ marginBottom: '12px' }}>
            <div style={{ marginBottom: '12px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#ef4444', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🛡️ Détection des Pièges
              </h2>
              <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
                Identifie les paris risqués avec cotes trompeuses
              </p>
              <p style={{ color: '#666', fontSize: '10px' }}>
                Évitez les favoris à cotes ultra-basses et les matchs déséquilibrés
              </p>
            </div>
            <AntiTrapSection matches={matches}/>
          </div>)}

        {/* Section Bankroll */}
        {activeSection === 'bankroll' && (<div style={{ marginBottom: '12px' }}>
            <div style={{ marginBottom: '12px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#22c55e', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                💰 Gestion de Bankroll
              </h2>
              <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
                Optimisez vos mises selon votre capital
              </p>
              <p style={{ color: '#666', fontSize: '10px' }}>
                Méthode Kelly • Mise recommandée: 1-3% du capital
              </p>
            </div>
            <BankrollSection />
          </div>)}

        {/* Section Résultats */}
        {activeSection === 'results' && (<div style={{ marginBottom: '12px' }}>
            <div style={{ marginBottom: '12px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#8b5cf6', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📊 Historique & Stats
              </h2>
              <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
                Suivez vos performances et taux de réussite
              </p>
              <p style={{ color: '#666', fontSize: '10px' }}>
                Objectif: Maintenir un ROI positif sur le long terme
              </p>
            </div>
            <ResultsSection />
          </div>)}

        {/* Section Expert - Conseils Expert */}
        {activeSection === 'expert' && (<ExpertAdviceSection_1.ExpertAdviceSection matches={matches}/>)}

        {/* Section NFL */}
        {activeSection === 'nfl' && (<NFLSection />)}

        {/* Section NHL */}
        {activeSection === 'nhl' && (<NHLSection matches={matches.filter(function (m) { return m.sport === 'Hockey'; })} loading={loading} lastUpdate={lastUpdate}/>)}

        {/* Section Tennis */}
        {activeSection === 'tennis' && (<TennisSection />)}

        {/* Section API Status - Visible uniquement pour les admins */}
        {activeSection === 'apistatus' && (userInfo === null || userInfo === void 0 ? void 0 : userInfo.role) === 'admin' && (<ApiStatusSection />)}

        {/* Section Pronostiqueur Pro - Visible uniquement pour les admins */}
        {activeSection === 'pronostiqueur' && (userInfo === null || userInfo === void 0 ? void 0 : userInfo.role) === 'admin' && (<PronostiqueurProSection />)}

        {/* Section Admin - Visible uniquement pour les admins */}
        {activeSection === 'admin' && (userInfo === null || userInfo === void 0 ? void 0 : userInfo.role) === 'admin' && (<div style={{ marginBottom: '12px' }}>
            <div style={{ marginBottom: '12px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#eab308', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚙️ Administration
              </h2>
              <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
                Gestion des utilisateurs et des accès
              </p>
            </div>
            <AdminPanel />
          </div>)}
      </main>
    </div>);
}
// Composant NavButton (menu vertical)
function NavButton(_a) {
    var icon = _a.icon, label = _a.label, active = _a.active, onClick = _a.onClick, color = _a.color;
    return (<button onClick={onClick} style={{
            width: '52px',
            padding: '6px 4px',
            borderRadius: '8px',
            border: 'none',
            background: active ? "".concat(color, "20") : 'transparent',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
            transition: 'all 0.2s'
        }} title={label}>
      <span style={{ fontSize: '18px' }}>{icon}</span>
      <span style={{
            fontSize: '8px',
            color: active ? color : '#666',
            fontWeight: active ? 'bold' : 'normal',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
        }}>{label}</span>
    </button>);
}
// Composant TabButtonCompact
function TabButtonCompact(_a) {
    var active = _a.active, onClick = _a.onClick, icon = _a.icon, label = _a.label, count = _a.count, isLive = _a.isLive;
    return (<button onClick={onClick} style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: active ? '1px solid #f97316' : isLive ? '1px solid #ef4444' : '1px solid #333',
            background: active ? '#f97316' : isLive ? '#ef444420' : 'transparent',
            color: active ? '#fff' : isLive ? '#ef4444' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: active ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
            flexDirection: 'column',
            minWidth: '60px',
            animation: isLive && !active ? 'pulse 2s infinite' : 'none'
        }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ animation: isLive ? 'pulse 1s infinite' : 'none' }}>{icon}</span>
        <span style={{ fontWeight: 'bold' }}>{count}</span>
      </div>
      <span style={{ fontSize: '9px', opacity: 0.9 }}>{label}</span>
    </button>);
}
// Composant NBAMatchCard - Affichage spécifique pour le basket
function NBAMatchCard(_a) {
    var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    var match = _a.match, index = _a.index;
    var riskPercentage = (_c = (_b = match.insight) === null || _b === void 0 ? void 0 : _b.riskPercentage) !== null && _c !== void 0 ? _c : 50;
    var riskColor = riskPercentage <= 40 ? '#22c55e' : riskPercentage <= 50 ? '#f97316' : '#ef4444';
    var riskLabel = riskPercentage <= 40 ? 'Sûr' : riskPercentage <= 50 ? 'Modéré' : 'Audacieux';
    // Données NBA
    var nba = match.nbaPredictions;
    var isHomeFavorite = (nba === null || nba === void 0 ? void 0 : nba.predictedWinner) === 'home';
    var winnerProb = (nba === null || nba === void 0 ? void 0 : nba.winnerProb) || 50;
    var confidenceColor = (nba === null || nba === void 0 ? void 0 : nba.confidence) === 'high' ? '#22c55e' : (nba === null || nba === void 0 ? void 0 : nba.confidence) === 'medium' ? '#f97316' : '#ef4444';
    // Scores live
    var isLive = match.isLive;
    var homeScore = match.homeScore;
    var awayScore = match.awayScore;
    var period = match.period;
    var clock = match.clock;
    // Formatter le quart-temps
    var periodLabel = period ? (period <= 4 ? "Q".concat(period) : "OT".concat(period - 4)) : '';
    return (<div style={{
            background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
            borderRadius: '12px',
            padding: '14px',
            border: isLive ? '2px solid #ef4444' : "1px solid ".concat(isHomeFavorite ? '#f9731660' : '#3b82f660'),
            marginBottom: '10px',
            boxShadow: isLive ? '0 4px 20px rgba(239, 68, 68, 0.3)' : isHomeFavorite ? '0 4px 20px rgba(249, 115, 22, 0.15)' : '0 4px 20px rgba(59, 130, 246, 0.1)'
        }}>
      {/* Header avec index et league */}
      <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            background: isLive ? '#ef4444' : '#f97316',
            color: '#fff',
            width: '26px',
            height: '26px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold',
            animation: isLive ? 'pulse 1.5s infinite' : 'none'
        }}>{index}</span>
          <span style={{ fontSize: '11px', color: '#888' }}>🏀 {match.league}</span>
          {match.homeRecord && match.awayRecord && (<span style={{ fontSize: '9px', color: '#666' }}>
              ({match.homeRecord} vs {match.awayRecord})
            </span>)}
        </div>
        <div style={{
            background: isLive ? '#ef444420' : "".concat(riskColor, "20"),
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '9px',
            color: isLive ? '#ef4444' : riskColor,
            fontWeight: 'bold',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
        }}>
          {isLive && <span style={{ animation: 'pulse 1s infinite' }}>🔴</span>}
          {isLive ? 'LIVE' : riskLabel}
        </div>
      </div>
      
      {/* SCORES LIVE ou TEAMS */}
      <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            padding: '10px',
            background: isLive ? '#1a0a0a' : '#111',
            borderRadius: '10px',
            border: isLive ? '1px solid #ef444430' : 'none'
        }}>
        {/* Home Team */}
        <div style={{
            flex: 1,
            textAlign: 'center',
            padding: '8px',
            borderRadius: '8px',
            background: isHomeFavorite ? 'linear-gradient(135deg, #f9731620 0%, #f9731610 100%)' : 'transparent',
            border: isHomeFavorite ? '2px solid #f97316' : '2px solid transparent'
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 'bold',
            color: isHomeFavorite ? '#f97316' : '#fff',
            marginBottom: '4px'
        }}>
            {isHomeFavorite && '⭐ '}{match.homeTeam}
          </div>
          <div style={{ fontSize: '10px', color: '#888' }}>
            🏠 Domicile
          </div>
          {/* SCORE LIVE */}
          {isLive && homeScore !== undefined && (<div style={{
                marginTop: '6px',
                fontSize: '28px',
                fontWeight: 'bold',
                color: homeScore > (awayScore || 0) ? '#22c55e' : homeScore < (awayScore || 0) ? '#ef4444' : '#f97316'
            }}>
              {homeScore}
            </div>)}
          {!isLive && (<div style={{
                marginTop: '6px',
                fontSize: '18px',
                fontWeight: 'bold',
                color: isHomeFavorite ? '#f97316' : '#888'
            }}>
              {isHomeFavorite ? winnerProb : 100 - winnerProb}%
            </div>)}
        </div>
        
        {/* VS ou SCORE INFO */}
        <div style={{ padding: '0 10px', textAlign: 'center' }}>
          {isLive && clock ? (<div style={{
                background: '#ef444420',
                border: '1px solid #ef4444',
                padding: '6px 12px',
                borderRadius: '6px'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#ef4444' }}>
                {periodLabel}
              </div>
              <div style={{ fontSize: '12px', color: '#fff', fontFamily: 'monospace' }}>
                {clock}
              </div>
            </div>) : (<div style={{
                fontSize: '10px',
                color: '#666',
                background: '#1a1a1a',
                padding: '6px 10px',
                borderRadius: '6px'
            }}>
              VS
            </div>)}
        </div>
        
        {/* Away Team */}
        <div style={{
            flex: 1,
            textAlign: 'center',
            padding: '8px',
            borderRadius: '8px',
            background: !isHomeFavorite ? 'linear-gradient(135deg, #3b82f620 0%, #3b82f610 100%)' : 'transparent',
            border: !isHomeFavorite ? '2px solid #3b82f6' : '2px solid transparent'
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 'bold',
            color: !isHomeFavorite ? '#3b82f6' : '#fff',
            marginBottom: '4px'
        }}>
            {!isHomeFavorite && '⭐ '}{match.awayTeam}
          </div>
          <div style={{ fontSize: '10px', color: '#888' }}>
            ✈️ Extérieur
          </div>
          {/* SCORE LIVE */}
          {isLive && awayScore !== undefined && (<div style={{
                marginTop: '6px',
                fontSize: '28px',
                fontWeight: 'bold',
                color: awayScore > (homeScore || 0) ? '#22c55e' : awayScore < (homeScore || 0) ? '#ef4444' : '#f97316'
            }}>
              {awayScore}
            </div>)}
          {!isLive && (<div style={{
                marginTop: '6px',
                fontSize: '18px',
                fontWeight: 'bold',
                color: !isHomeFavorite ? '#3b82f6' : '#888'
            }}>
              {!isHomeFavorite ? winnerProb : 100 - winnerProb}%
            </div>)}
        </div>
      </div>
      
      {/* PRÉDICTION PRINCIPALE */}
      <div style={{
            background: "linear-gradient(135deg, ".concat(isHomeFavorite ? '#f9731615' : '#3b82f615', " 0%, #0a0a0a 100%)"),
            borderRadius: '10px',
            padding: '12px',
            marginBottom: '12px',
            border: "1px solid ".concat(isHomeFavorite ? '#f9731630' : '#3b82f630')
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>🏆 VAINQUEUR PRÉDIT</div>
            <div style={{
            fontSize: '16px',
            fontWeight: 'bold',
            color: isHomeFavorite ? '#f97316' : '#3b82f6'
        }}>
              ⭐ {nba === null || nba === void 0 ? void 0 : nba.winnerTeam}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: confidenceColor }}>
              {winnerProb}%
            </div>
            <div style={{ fontSize: '9px', color: '#888' }}>
              Confiance: {(nba === null || nba === void 0 ? void 0 : nba.confidence) === 'high' ? 'Haute' : (nba === null || nba === void 0 ? void 0 : nba.confidence) === 'medium' ? 'Moyenne' : 'Faible'}
            </div>
          </div>
        </div>
      </div>
      
      {/* TAG DE STATUT AUTOMATIQUE NBA - Basé sur le backtest */}
      {(function () {
            var _a;
            var nbaConfidence = (_a = nba === null || nba === void 0 ? void 0 : nba.confidence) !== null && _a !== void 0 ? _a : 'medium';
            var isLow = nbaConfidence === 'low';
            var isMedium = nbaConfidence === 'medium';
            var isHigh = nbaConfidence === 'high';
            var statusConfig = isLow ? {
                bg: 'linear-gradient(135deg, #ef444420 0%, #dc262620 100%)',
                border: '2px solid #ef4444',
                color: '#ef4444',
                icon: '🚫',
                label: 'REJETÉ AUTO',
                subLabel: 'Confiance LOW - 0% win rate historique',
                shadow: '0 4px 15px rgba(239, 68, 68, 0.2)'
            } : isMedium ? {
                bg: 'linear-gradient(135deg, #f9731620 0%, #ea580c20 100%)',
                border: '2px solid #f97316',
                color: '#f97316',
                icon: '⚠️',
                label: 'À CONSIDÉRER',
                subLabel: 'Confiance MEDIUM - Profitable en backtest',
                shadow: '0 4px 15px rgba(249, 115, 22, 0.15)'
            } : {
                bg: 'linear-gradient(135deg, #22c55e20 0%, #16a34a20 100%)',
                border: '2px solid #22c55e',
                color: '#22c55e',
                icon: '✅',
                label: 'À PRENDRE',
                subLabel: 'Confiance HIGH - Meilleure performance backtest',
                shadow: '0 4px 15px rgba(34, 197, 94, 0.2)'
            };
            return (<div style={{
                    background: statusConfig.bg,
                    border: statusConfig.border,
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: statusConfig.shadow
                }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>{statusConfig.icon}</span>
              <div>
                <div style={{
                    color: statusConfig.color,
                    fontSize: '14px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                }}>
                  {statusConfig.label}
                </div>
                <div style={{ color: '#888', fontSize: '10px', marginTop: '2px' }}>
                  {statusConfig.subLabel}
                </div>
              </div>
            </div>
            <div style={{
                    background: statusConfig.color,
                    color: '#fff',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase'
                }}>
              {nbaConfidence.toUpperCase()}
            </div>
          </div>);
        })()}
      
      {/* GRILLE PRÉDICTIONS NBA */}
      <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px'
        }}>
        {/* SPREAD */}
        <div style={{
            background: '#1a1a1a',
            borderRadius: '8px',
            padding: '10px'
        }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>📊 SPREAD</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#22c55e' }}>
            {(_d = nba === null || nba === void 0 ? void 0 : nba.spread) === null || _d === void 0 ? void 0 : _d.favorite} ({((_f = (_e = nba === null || nba === void 0 ? void 0 : nba.spread) === null || _e === void 0 ? void 0 : _e.line) !== null && _f !== void 0 ? _f : 0) > 0 ? '-' : '+'}{Math.abs((_h = (_g = nba === null || nba === void 0 ? void 0 : nba.spread) === null || _g === void 0 ? void 0 : _g.line) !== null && _h !== void 0 ? _h : 0)})
          </div>
          <div style={{ fontSize: '9px', color: '#666' }}>
            Confiance: {(_j = nba === null || nba === void 0 ? void 0 : nba.spread) === null || _j === void 0 ? void 0 : _j.confidence}%
          </div>
        </div>
        
        {/* TOTAL POINTS */}
        <div style={{
            background: '#1a1a1a',
            borderRadius: '8px',
            padding: '10px'
        }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>📈 TOTAL POINTS</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: ((_l = (_k = nba === null || nba === void 0 ? void 0 : nba.totalPoints) === null || _k === void 0 ? void 0 : _k.overProb) !== null && _l !== void 0 ? _l : 0) >= 55 ? '#22c55e' : '#f97316' }}>
            {(_m = nba === null || nba === void 0 ? void 0 : nba.totalPoints) === null || _m === void 0 ? void 0 : _m.recommendation}
          </div>
          <div style={{ fontSize: '9px', color: '#666' }}>
            Prédit: {(_o = nba === null || nba === void 0 ? void 0 : nba.totalPoints) === null || _o === void 0 ? void 0 : _o.predicted} pts ({(_p = nba === null || nba === void 0 ? void 0 : nba.totalPoints) === null || _p === void 0 ? void 0 : _p.overProb}% over)
          </div>
        </div>
        
        {/* MEILLEUR MARQUEUR */}
        <div style={{
            background: '#1a1a1a',
            borderRadius: '8px',
            padding: '10px'
        }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>🏀 TOP SCOREUR</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#eab308' }}>
            {(_q = nba === null || nba === void 0 ? void 0 : nba.topScorer) === null || _q === void 0 ? void 0 : _q.player}
          </div>
          <div style={{ fontSize: '9px', color: '#666' }}>
            {(_r = nba === null || nba === void 0 ? void 0 : nba.topScorer) === null || _r === void 0 ? void 0 : _r.team} • ~{(_s = nba === null || nba === void 0 ? void 0 : nba.topScorer) === null || _s === void 0 ? void 0 : _s.predictedPoints} pts
          </div>
        </div>
        
        {/* KEY MATCHUP */}
        <div style={{
            background: '#1a1a1a',
            borderRadius: '8px',
            padding: '10px'
        }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>⚔️ DUEL CLÉ</div>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#a855f7' }}>
            {nba === null || nba === void 0 ? void 0 : nba.keyMatchup}
          </div>
          <div style={{ fontSize: '9px', color: '#666' }}>
            Impact sur le résultat
          </div>
        </div>
      </div>
      
      {/* Cotes */}
      <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '8px',
            marginTop: '12px',
            paddingTop: '10px',
            borderTop: '1px solid #222'
        }}>
        <span style={{
            padding: '4px 10px',
            background: isHomeFavorite ? '#f97316' : '#1a1a1a',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#fff',
            fontWeight: isHomeFavorite ? 'bold' : 'normal'
        }}>
          {match.homeTeam.slice(0, 10)}: {formatOdds(match.oddsHome)}
        </span>
        <span style={{
            padding: '4px 10px',
            background: !isHomeFavorite ? '#3b82f6' : '#1a1a1a',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#fff',
            fontWeight: !isHomeFavorite ? 'bold' : 'normal'
        }}>
          {match.awayTeam.slice(0, 10)}: {formatOdds(match.oddsAway)}
        </span>
      </div>
    </div>);
}
// Composant MatchCardCompact - Wrapper qui choisit le bon composant selon le sport
function MatchCardCompact(_a) {
    var match = _a.match, index = _a.index;
    // Si c'est un match NBA avec prédictions, utiliser le composant spécifique
    if (match.sport === 'Basket' && match.nbaPredictions) {
        return <NBAMatchCard match={match} index={index}/>;
    }
    // Sinon, utiliser le composant Football standard
    return <FootballMatchCard match={match} index={index}/>;
}
// Composant FootballMatchCard - Affichage pour le football
function FootballMatchCard(_a) {
    var _this = this;
    var _b, _c, _d, _e, _f, _g, _h, _j, _k;
    var match = _a.match, index = _a.index;
    var _l = (0, react_1.useState)(false), showAllOptions = _l[0], setShowAllOptions = _l[1];
    var _m = (0, react_1.useState)(null), enrichment = _m[0], setEnrichment = _m[1];
    var _o = (0, react_1.useState)(true), loadingEnrichment = _o[0], setLoadingEnrichment = _o[1];
    // IMPORTANT: Utiliser le statut de l'API en PRIORITÉ
    // Fallback sur calcul local si non disponible
    var now = new Date();
    var matchDate = new Date(match.date);
    var matchDurationMs = 2 * 60 * 60 * 1000; // 2h pour le foot
    var matchEndTime = new Date(matchDate.getTime() + matchDurationMs);
    // Priorité: API > calcul local
    var isLive = (_b = match.isLive) !== null && _b !== void 0 ? _b : (now >= matchDate && now <= matchEndTime);
    var isFinished = (_c = match.isFinished) !== null && _c !== void 0 ? _c : now > matchEndTime;
    // Scores et minute
    var homeScore = match.homeScore;
    var awayScore = match.awayScore;
    var minute = match.minute;
    // Charger les données d'enrichissement (blessures)
    (0, react_1.useEffect)(function () {
        var fetchEnrichment = function () { return __awaiter(_this, void 0, void 0, function () {
            var response, data, e_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, 4, 5]);
                        return [4 /*yield*/, fetch("/api/pronos-enrichment?homeTeam=".concat(encodeURIComponent(match.homeTeam), "&awayTeam=").concat(encodeURIComponent(match.awayTeam)))];
                    case 1:
                        response = _a.sent();
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = _a.sent();
                        if (data.success && data.data) {
                            setEnrichment(data.data);
                        }
                        return [3 /*break*/, 5];
                    case 3:
                        e_4 = _a.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        setLoadingEnrichment(false);
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        }); };
        fetchEnrichment();
    }, [match.homeTeam, match.awayTeam]);
    var riskPercentage = (_e = (_d = match.insight) === null || _d === void 0 ? void 0 : _d.riskPercentage) !== null && _e !== void 0 ? _e : 50;
    var riskColor = riskPercentage <= 40 ? '#22c55e' : riskPercentage <= 50 ? '#f97316' : '#ef4444';
    var riskLabel = riskPercentage <= 40 ? 'Sûr' : riskPercentage <= 50 ? 'Modéré' : 'Audacieux';
    // Validation des cotes - éviter NaN
    var validOddsHome = (match.oddsHome && match.oddsHome > 1) ? match.oddsHome : 2.0;
    var validOddsAway = (match.oddsAway && match.oddsAway > 1) ? match.oddsAway : 2.0;
    var validOddsDraw = (match.oddsDraw && match.oddsDraw > 1) ? match.oddsDraw : 3.3;
    // Calcul des probabilités implicites (avec validation)
    var totalImplied = (1 / validOddsHome) + (1 / validOddsAway) + (validOddsDraw ? 1 / validOddsDraw : 0);
    var homeProb = Math.round((1 / validOddsHome) / totalImplied * 100);
    var awayProb = Math.round((1 / validOddsAway) / totalImplied * 100);
    var drawProb = validOddsDraw ? Math.round((1 / validOddsDraw) / totalImplied * 100) : 0;
    // Déterminer le favori et la recommandation
    var favorite = validOddsHome < validOddsAway ? 'home' : 'away';
    var favoriteTeam = favorite === 'home' ? match.homeTeam : match.awayTeam;
    var favoriteProb = favorite === 'home' ? homeProb : awayProb;
    var favoriteOdds = favorite === 'home' ? validOddsHome : validOddsAway;
    // ==========================================
    // OPTIONS DE PARIS COMPLÈTES
    // ==========================================
    // 1. VICTOIRE SÈCHE (1, X, 2)
    var homeWinClean = homeProb; // Victoire Domicile
    var awayWinClean = awayProb; // Victoire Extérieur
    var drawClean = drawProb; // Match Nul
    // 2. DOUBLE CHANCE (1X, X2, 12)
    var homeOrDrawProb = homeProb + drawProb; // 1X: Domicile ou Nul
    var awayOrDrawProb = awayProb + drawProb; // X2: Extérieur ou Nul
    var homeOrAwayProb = homeProb + awayProb; // 12: Pas de nul
    // 3. DRAW NO BET (DNB) - Remboursé si nul
    var totalNoDraw = homeProb + awayProb;
    var dnbHome = totalNoDraw > 0 ? Math.round((homeProb / totalNoDraw) * 100) : 50;
    var dnbAway = totalNoDraw > 0 ? Math.round((awayProb / totalNoDraw) * 100) : 50;
    var drawNoBetOdds = {
        home: dnbHome > 0 ? Math.round((100 / dnbHome) * 100) / 100 : 1.5,
        away: dnbAway > 0 ? Math.round((100 / dnbAway) * 100) / 100 : 2.5
    };
    // Recommandation intelligente
    var recommendation = '';
    var recColor = '#22c55e';
    var recommendationProb = 0; // Probabilité RÉELLE de la recommandation
    var recommendationType = ''; // Type de pari recommandé
    if (favoriteOdds < 1.5 && favoriteProb >= 65) {
        recommendation = "\u2705 Victoire ".concat(favoriteTeam);
        recommendationProb = favoriteProb; // Probabilité de victoire du favori
        recommendationType = 'clean-win';
        recColor = '#22c55e';
    }
    else if (favoriteOdds < 2.0 && favoriteProb >= 50) {
        recommendation = "\u2705 ".concat(favoriteTeam, " ou Nul");
        // Probabilité = victoire favori + nul
        recommendationProb = favorite === 'home' ? homeOrDrawProb : awayOrDrawProb;
        recommendationType = 'double-chance';
        recColor = '#22c55e';
    }
    else if (drawProb >= 30) {
        recommendation = "\u26A0\uFE0F Risque de Nul";
        recommendationProb = drawProb;
        recommendationType = 'draw-risk';
        recColor = '#f97316';
    }
    else {
        recommendation = "\u23F3 Match serr\u00E9";
        recommendationProb = Math.max(homeProb, awayProb);
        recommendationType = 'tight-match';
        recColor = '#f97316';
    }
    // Taux de réussite = la VRAIE probabilité de la recommandation (pas un chiffre arbitraire!)
    var successRate = recommendationProb;
    var successColor = successRate >= 70 ? '#22c55e' : successRate >= 55 ? '#f97316' : '#ef4444';
    // Avertissement si probabilité faible
    var lowProbWarning = successRate < 55 && recommendation.includes('✅');
    return (<div style={{
            background: isLive ? '#ef444410' : isFinished ? '#1a1a1a' : '#111',
            borderRadius: '10px',
            padding: '12px',
            border: isLive ? '1px solid #ef4444' : isFinished ? '1px solid #333' : "1px solid ".concat(riskColor, "30"),
            marginBottom: '8px',
            opacity: isFinished ? 0.7 : 1
        }}>
      {/* Ligne principale */}
      <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '8px'
        }}>
        {/* Index + Risk Label + Live Badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <span style={{
            background: isLive ? '#ef4444' : isFinished ? '#666' : riskColor,
            color: '#fff',
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 'bold',
            flexShrink: 0,
            animation: isLive ? 'pulse 1.5s infinite' : 'none'
        }}>{index}</span>
          <span style={{ fontSize: '7px', color: isLive ? '#ef4444' : isFinished ? '#666' : riskColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
            {isLive ? '🔴 LIVE' : isFinished ? 'TERMINÉ' : riskLabel}
          </span>
          {/* Afficher la minute si live */}
          {isLive && minute && (<span style={{ fontSize: '9px', color: '#ef4444', fontWeight: 'bold' }}>
              {minute}
            </span>)}
        </div>
        
        {/* Teams + Scores */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{match.homeTeam}</span>
            {/* Score Live */}
            {isLive && homeScore !== undefined && awayScore !== undefined && (<span style={{
                fontSize: '18px',
                fontWeight: 'bold',
                color: homeScore > awayScore ? '#22c55e' : homeScore < awayScore ? '#ef4444' : '#f97316',
                fontFamily: 'monospace'
            }}>
                {homeScore} - {awayScore}
              </span>)}
            {isFinished && homeScore !== undefined && awayScore !== undefined && (<span style={{ fontSize: '14px', fontWeight: 'bold', color: '#888', fontFamily: 'monospace' }}>
                ({homeScore} - {awayScore})
              </span>)}
            <span>{match.awayTeam}</span>
          </div>
          <div style={{ color: '#666', fontSize: '10px' }}>
            {match.league} • {match.sport}
          </div>
          {/* Indicateur blessures */}
          {!loadingEnrichment && enrichment && enrichment.totalInjuries && enrichment.totalInjuries > 0 && (<div style={{
                color: '#ef4444',
                fontSize: '9px',
                marginTop: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
            }}>
              🏥 {enrichment.totalInjuries} joueur{enrichment.totalInjuries > 1 ? 's' : ''} blessé{enrichment.totalInjuries > 1 ? 's' : ''}
              {((_f = enrichment.homeTeam) === null || _f === void 0 ? void 0 : _f.keyInjuries) && enrichment.homeTeam.keyInjuries.length > 0 && (<span style={{ color: '#888' }}>({enrichment.homeTeam.keyInjuries[0].slice(0, 12)}...)</span>)}
            </div>)}
        </div>
        
        {/* Odds */}
        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
          <span style={{ padding: '3px 6px', background: favorite === 'home' ? '#f97316' : '#1a1a1a', borderRadius: '4px', fontSize: '10px', color: '#fff' }}>{formatOdds(match.oddsHome)}</span>
          {match.oddsDraw != null && typeof match.oddsDraw === 'number' && <span style={{ padding: '3px 6px', background: '#1a1a1a', borderRadius: '4px', fontSize: '10px', color: '#888' }}>{formatOdds(match.oddsDraw)}</span>}
          <span style={{ padding: '3px 6px', background: favorite === 'away' ? '#f97316' : '#1a1a1a', borderRadius: '4px', fontSize: '10px', color: '#fff' }}>{formatOdds(match.oddsAway)}</span>
        </div>
        
        {/* Risk Percentage */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: riskColor, fontSize: '12px', fontWeight: 'bold' }}>{(_h = (_g = match.insight) === null || _g === void 0 ? void 0 : _g.riskPercentage) !== null && _h !== void 0 ? _h : 50}%</div>
          <div style={{ color: '#666', fontSize: '8px' }}>Risque</div>
        </div>
      </div>
      
      {/* RECOMMANDATION PRINCIPALE */}
      <div style={{
            background: '#1a1a1a',
            borderRadius: '8px',
            padding: '10px',
            marginBottom: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        }}>
        <div>
          <div style={{ color: recColor, fontSize: '14px', fontWeight: 'bold' }}>
            {recommendation}
            {lowProbWarning && (<span style={{ fontSize: '10px', color: '#ef4444', marginLeft: '6px' }}>
                ⚠️ Risqué
              </span>)}
          </div>
          <div style={{ color: '#888', fontSize: '10px', marginTop: '2px' }}>
            Probabilité: <span style={{ color: successColor, fontWeight: 'bold' }}>{successRate}%</span>
            {successRate < 55 && (<span style={{ color: '#ef4444', marginLeft: '4px' }}>
                (seuil recommandé: 55%+)
              </span>)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>Probabilités</div>
          <div style={{ display: 'flex', gap: '8px', fontSize: '10px' }}>
            <span style={{ color: favorite === 'home' ? '#f97316' : '#888' }}>🏠{homeProb}%</span>
            <span style={{ color: '#666' }}>🤝{drawProb}%</span>
            <span style={{ color: favorite === 'away' ? '#f97316' : '#888' }}>✈️{awayProb}%</span>
          </div>
        </div>
      </div>
      
      {/* TAG DE STATUT AUTOMATIQUE - Basé sur le backtest */}
      {(function () {
            var _a, _b;
            var confidence = (_b = (_a = match.insight) === null || _a === void 0 ? void 0 : _a.confidence) !== null && _b !== void 0 ? _b : 'medium';
            var isLow = confidence === 'low';
            var isMedium = confidence === 'medium';
            var isHigh = confidence === 'high' || confidence === 'very_high';
            var statusConfig = isLow ? {
                bg: 'linear-gradient(135deg, #ef444420 0%, #dc262620 100%)',
                border: '2px solid #ef4444',
                color: '#ef4444',
                icon: '🚫',
                label: 'REJETÉ AUTO',
                subLabel: 'Confiance LOW - 0% win rate historique',
                shadow: '0 4px 15px rgba(239, 68, 68, 0.2)'
            } : isMedium ? {
                bg: 'linear-gradient(135deg, #f9731620 0%, #ea580c20 100%)',
                border: '2px solid #f97316',
                color: '#f97316',
                icon: '⚠️',
                label: 'À CONSIDÉRER',
                subLabel: 'Confiance MEDIUM - Profitable en backtest',
                shadow: '0 4px 15px rgba(249, 115, 22, 0.15)'
            } : {
                bg: 'linear-gradient(135deg, #22c55e20 0%, #16a34a20 100%)',
                border: '2px solid #22c55e',
                color: '#22c55e',
                icon: '✅',
                label: 'À PRENDRE',
                subLabel: 'Confiance HIGH - Meilleure performance backtest',
                shadow: '0 4px 15px rgba(34, 197, 94, 0.2)'
            };
            return (<div style={{
                    background: statusConfig.bg,
                    border: statusConfig.border,
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: statusConfig.shadow
                }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>{statusConfig.icon}</span>
              <div>
                <div style={{
                    color: statusConfig.color,
                    fontSize: '14px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                }}>
                  {statusConfig.label}
                </div>
                <div style={{ color: '#888', fontSize: '10px', marginTop: '2px' }}>
                  {statusConfig.subLabel}
                </div>
              </div>
            </div>
            <div style={{
                    background: statusConfig.color,
                    color: '#fff',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase'
                }}>
              {confidence.toUpperCase()}
            </div>
          </div>);
        })()}
      
      {/* OPTIONS DE PARIS - GRILLE */}
      <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '6px',
            marginTop: '8px'
        }}>
        {/* VICTOIRE SÈCHE (1, X, 2) */}
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px',
            background: '#1a1a1a',
            borderRadius: '6px',
            fontSize: '10px'
        }}>
          <span style={{ fontSize: '14px' }}>🏆</span>
          <div>
            <div style={{ color: '#f97316', fontWeight: 'bold' }}>Victoire Sèche</div>
            <div style={{ color: '#888', fontSize: '9px' }}>
              1: {homeWinClean}% | X: {drawClean}% | 2: {awayWinClean}%
            </div>
          </div>
        </div>
        
        {/* DOUBLE CHANCE (1X, X2) */}
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px',
            background: recommendationType === 'double-chance' ? '#22c55e15' : '#1a1a1a',
            borderRadius: '6px',
            fontSize: '10px',
            border: recommendationType === 'double-chance' ? '1px solid #22c55e30' : 'none'
        }}>
          <span style={{ fontSize: '14px' }}>🎲</span>
          <div>
            <div style={{ color: '#22c55e', fontWeight: 'bold' }}>Double Chance</div>
            <div style={{ color: '#888', fontSize: '9px' }}>
              1X: {homeOrDrawProb}% | X2: {awayOrDrawProb}%
            </div>
          </div>
        </div>
        
        {/* BUTS - Over/Under 2.5 */}
        {match.goalsPrediction && (<div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px',
                background: match.goalsPrediction.over25 >= 55 ? '#22c55e15' : '#1a1a1a',
                borderRadius: '6px',
                fontSize: '10px',
                border: match.goalsPrediction.over25 >= 55 ? '1px solid #22c55e30' : 'none'
            }}>
            <span style={{ fontSize: '14px' }}>⚽</span>
            <div>
              <div style={{ color: match.goalsPrediction.over25 >= 55 ? '#22c55e' : '#f97316', fontWeight: 'bold' }}>
                {match.goalsPrediction.over25 >= 55 ? 'Over 2.5 Buts ✓' : 'Under 2.5 Buts ✓'}
              </div>
              <div style={{ color: '#888', fontSize: '9px' }}>
                {match.goalsPrediction.over25 >= 55
                ? "Plus de 2.5 buts: ".concat(match.goalsPrediction.over25, "% de chance")
                : "Moins de 2.5 buts: ".concat(match.goalsPrediction.under25, "% de chance")}
              </div>
              <div style={{ color: '#666', fontSize: '8px', marginTop: '2px' }}>
                Moyenne: {match.goalsPrediction.total} buts/match prévu
              </div>
            </div>
          </div>)}
        
        {/* BTTS - Les deux marquent */}
        {match.advancedPredictions && (<div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px',
                background: match.advancedPredictions.btts.yes >= 55 ? '#22c55e15' : '#1a1a1a',
                borderRadius: '6px',
                fontSize: '10px',
                border: match.advancedPredictions.btts.yes >= 55 ? '1px solid #22c55e30' : 'none'
            }}>
            <span style={{ fontSize: '14px' }}>🥅</span>
            <div>
              <div style={{ color: match.advancedPredictions.btts.yes >= 55 ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
                {match.advancedPredictions.btts.yes >= 55
                ? 'Les 2 équipes marquent ✓'
                : match.advancedPredictions.btts.yes >= 48
                    ? 'BTTS incertain ⚠️'
                    : '1 équipe à 0 probable'}
              </div>
              <div style={{ color: '#888', fontSize: '9px' }}>
                Les 2 marquent: {match.advancedPredictions.btts.yes}% | Au moins 1 à 0: {match.advancedPredictions.btts.no}%
              </div>
              <div style={{ color: '#666', fontSize: '8px', marginTop: '2px' }}>
                Seuil recommandé: 55%+ pour parier "Oui"
              </div>
            </div>
          </div>)}
        
        {/* CARTONS - REMOVED: No real data source */}
        {/* Previously showed pure estimation without actual card statistics */}
        
        {/* CORNERS - REMOVED: No real data source */}
        {/* Previously showed pure estimation without actual corner statistics */}
        
        {/* Value Bet */}
        {((_k = (_j = match.insight) === null || _j === void 0 ? void 0 : _j.valueBetDetected) !== null && _k !== void 0 ? _k : false) && (<div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px',
                background: '#22c55e15',
                borderRadius: '6px',
                fontSize: '10px',
                border: '1px solid #22c55e30'
            }}>
            <span style={{ fontSize: '14px' }}>💎</span>
            <div>
              <div style={{ color: '#22c55e', fontWeight: 'bold' }}>Value Bet</div>
              <div style={{ color: '#22c55e', fontSize: '9px' }}>Cote surévaluée</div>
            </div>
          </div>)}
      </div>
      
      {/* BOUTON VOIR PLUS D'OPTIONS */}
      {match.advancedPredictions && (<button onClick={function () { return setShowAllOptions(!showAllOptions); }} style={{
                width: '100%',
                marginTop: '8px',
                padding: '8px',
                background: 'transparent',
                border: '1px solid #333',
                borderRadius: '6px',
                color: '#888',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
            }}>
          {showAllOptions ? '▲ Moins d\'options' : '▼ Plus d\'options avancées'}
        </button>)}
      
      {/* OPTIONS AVANCÉES (dépliable) */}
      {showAllOptions && (<div style={{
                marginTop: '8px',
                padding: '10px',
                background: '#0a0a0a',
                borderRadius: '8px',
                border: '1px solid #222'
            }}>
          {/* VICTOIRE SÈCHE (1, X, 2) */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ color: '#f97316', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>
              🏆 Victoire Sèche (Résultat Exact)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              <div style={{
                padding: '8px',
                background: homeWinClean >= 50 ? '#f9731615' : '#1a1a1a',
                border: homeWinClean >= 50 ? '1px solid #f9731630' : 'none',
                borderRadius: '4px',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '9px', color: '#888' }}>1 (Domicile)</div>
                <div style={{ fontWeight: 'bold', color: homeWinClean >= 50 ? '#f97316' : '#fff', fontSize: '14px' }}>{homeWinClean}%</div>
                <div style={{ fontSize: '8px', color: '#666' }}>@{validOddsHome.toFixed(2)}</div>
              </div>
              <div style={{
                padding: '8px',
                background: drawClean >= 30 ? '#eab30815' : '#1a1a1a',
                border: drawClean >= 30 ? '1px solid #eab30830' : 'none',
                borderRadius: '4px',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '9px', color: '#888' }}>X (Nul)</div>
                <div style={{ fontWeight: 'bold', color: drawClean >= 30 ? '#eab308' : '#fff', fontSize: '14px' }}>{drawClean}%</div>
                <div style={{ fontSize: '8px', color: '#666' }}>@{validOddsDraw.toFixed(2)}</div>
              </div>
              <div style={{
                padding: '8px',
                background: awayWinClean >= 50 ? '#3b82f615' : '#1a1a1a',
                border: awayWinClean >= 50 ? '1px solid #3b82f630' : 'none',
                borderRadius: '4px',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '9px', color: '#888' }}>2 (Extérieur)</div>
                <div style={{ fontWeight: 'bold', color: awayWinClean >= 50 ? '#3b82f6' : '#fff', fontSize: '14px' }}>{awayWinClean}%</div>
                <div style={{ fontSize: '8px', color: '#666' }}>@{validOddsAway.toFixed(2)}</div>
              </div>
            </div>
          </div>
          
          {/* DOUBLE CHANCE */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ color: '#3b82f6', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>
              🎯 Double Chance
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              <div style={{
                padding: '8px',
                background: homeOrDrawProb >= 65 ? '#22c55e15' : '#1a1a1a',
                border: homeOrDrawProb >= 65 ? '1px solid #22c55e30' : 'none',
                borderRadius: '4px',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '9px', color: '#888' }}>1X</div>
                <div style={{ fontWeight: 'bold', color: homeOrDrawProb >= 65 ? '#22c55e' : '#fff', fontSize: '12px' }}>{homeOrDrawProb}%</div>
                <div style={{ fontSize: '8px', color: '#666' }}>Dom ou Nul</div>
              </div>
              <div style={{
                padding: '8px',
                background: awayOrDrawProb >= 65 ? '#3b82f615' : '#1a1a1a',
                border: awayOrDrawProb >= 65 ? '1px solid #3b82f630' : 'none',
                borderRadius: '4px',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '9px', color: '#888' }}>X2</div>
                <div style={{ fontWeight: 'bold', color: awayOrDrawProb >= 65 ? '#3b82f6' : '#fff', fontSize: '12px' }}>{awayOrDrawProb}%</div>
                <div style={{ fontSize: '8px', color: '#666' }}>Ext ou Nul</div>
              </div>
              <div style={{
                padding: '8px',
                background: '#1a1a1a',
                borderRadius: '4px',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '9px', color: '#888' }}>12</div>
                <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '12px' }}>{homeOrAwayProb}%</div>
                <div style={{ fontSize: '8px', color: '#666' }}>Pas de nul</div>
              </div>
            </div>
          </div>
          
          {/* DRAW NO BET */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ color: '#a855f7', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>
              🛡️ Draw No Bet (DNB)
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{
                flex: 1,
                padding: '8px',
                background: dnbHome >= 55 ? '#a855f715' : '#1a1a1a',
                borderRadius: '4px',
                textAlign: 'center',
                border: dnbHome >= 55 ? '1px solid #a855f730' : 'none'
            }}>
                <div style={{ fontSize: '9px', color: '#888' }}>{match.homeTeam}</div>
                <div style={{ fontWeight: 'bold', color: dnbHome >= 55 ? '#a855f7' : '#fff', fontSize: '14px' }}>{dnbHome}%</div>
                <div style={{ fontSize: '8px', color: '#666' }}>@{drawNoBetOdds.home.toFixed(2)}</div>
              </div>
              <div style={{
                flex: 1,
                padding: '8px',
                background: dnbAway >= 55 ? '#a855f715' : '#1a1a1a',
                borderRadius: '4px',
                textAlign: 'center',
                border: dnbAway >= 55 ? '1px solid #a855f730' : 'none'
            }}>
                <div style={{ fontSize: '9px', color: '#888' }}>{match.awayTeam}</div>
                <div style={{ fontWeight: 'bold', color: dnbAway >= 55 ? '#a855f7' : '#fff', fontSize: '14px' }}>{dnbAway}%</div>
                <div style={{ fontSize: '8px', color: '#666' }}>@{drawNoBetOdds.away.toFixed(2)}</div>
              </div>
            </div>
          </div>
          
          {/* OVER/UNDER ÉTENDUS */}
          {match.goalsPrediction && (<div style={{ marginBottom: '12px' }}>
              <div style={{ color: '#22c55e', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>
                ⚽ Over/Under Buts
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                <div style={{ padding: '6px', background: '#1a1a1a', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '8px', color: '#888' }}>O 0.5</div>
                  <div style={{ fontWeight: 'bold', color: '#22c55e', fontSize: '11px' }}>{match.goalsPrediction.over05 || 95}%</div>
                </div>
                <div style={{ padding: '6px', background: match.goalsPrediction.over15 >= 65 ? '#22c55e15' : '#1a1a1a', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '8px', color: '#888' }}>O 1.5</div>
                  <div style={{ fontWeight: 'bold', color: match.goalsPrediction.over15 >= 65 ? '#22c55e' : '#fff', fontSize: '11px' }}>{match.goalsPrediction.over15}%</div>
                </div>
                <div style={{ padding: '6px', background: match.goalsPrediction.over25 >= 55 ? '#22c55e15' : '#1a1a1a', borderRadius: '4px', textAlign: 'center', border: match.goalsPrediction.over25 >= 55 ? '1px solid #22c55e30' : 'none' }}>
                  <div style={{ fontSize: '8px', color: '#888' }}>O 2.5</div>
                  <div style={{ fontWeight: 'bold', color: match.goalsPrediction.over25 >= 55 ? '#22c55e' : '#fff', fontSize: '11px' }}>{match.goalsPrediction.over25}%</div>
                </div>
                <div style={{ padding: '6px', background: '#1a1a1a', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '8px', color: '#888' }}>O 3.5</div>
                  <div style={{ fontWeight: 'bold', color: '#f97316', fontSize: '11px' }}>{match.goalsPrediction.over35 || 45}%</div>
                </div>
                <div style={{ padding: '6px', background: '#1a1a1a', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '8px', color: '#888' }}>O 4.5</div>
                  <div style={{ fontWeight: 'bold', color: '#ef4444', fontSize: '11px' }}>{match.goalsPrediction.over45 || 25}%</div>
                </div>
              </div>
            </div>)}
          
          {/* BTTS */}
          {match.advancedPredictions && (<div style={{ marginBottom: '12px' }}>
              <div style={{ color: '#14b8a6', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>
                🥅 Les 2 Marquent (BTTS)
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{
                    flex: 1,
                    padding: '8px',
                    background: match.advancedPredictions.btts.yes >= 55 ? '#22c55e15' : '#1a1a1a',
                    borderRadius: '4px',
                    textAlign: 'center',
                    border: match.advancedPredictions.btts.yes >= 55 ? '1px solid #22c55e30' : 'none'
                }}>
                  <div style={{ fontSize: '10px', color: '#888' }}>OUI</div>
                  <div style={{ fontWeight: 'bold', color: match.advancedPredictions.btts.yes >= 55 ? '#22c55e' : '#fff', fontSize: '16px' }}>{match.advancedPredictions.btts.yes}%</div>
                </div>
                <div style={{
                    flex: 1,
                    padding: '8px',
                    background: match.advancedPredictions.btts.no >= 55 ? '#ef444415' : '#1a1a1a',
                    borderRadius: '4px',
                    textAlign: 'center'
                }}>
                  <div style={{ fontSize: '10px', color: '#888' }}>NON</div>
                  <div style={{ fontWeight: 'bold', color: match.advancedPredictions.btts.no >= 55 ? '#ef4444' : '#fff', fontSize: '16px' }}>{match.advancedPredictions.btts.no}%</div>
                </div>
              </div>
            </div>)}
          
          {/* Score Exact */}
          {match.advancedPredictions && (<div style={{ marginBottom: '12px' }}>
              <div style={{ color: '#f97316', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>
                📊 Scores Exacts Probables
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {match.advancedPredictions.correctScore.map(function (score, idx) { return (<div key={idx} style={{
                        padding: '6px 10px',
                        background: idx === 0 ? '#f9731615' : '#1a1a1a',
                        border: idx === 0 ? '1px solid #f9731630' : 'none',
                        borderRadius: '4px',
                        fontSize: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                    <span style={{ fontWeight: 'bold', color: idx === 0 ? '#f97316' : '#fff' }}>{score.home}-{score.away}</span>
                    <span style={{ color: '#888' }}>({score.prob}%)</span>
                  </div>); })}
              </div>
            </div>)}
          
          {/* Résultat MT */}
          {match.advancedPredictions && (<div style={{ marginBottom: '12px' }}>
              <div style={{ color: '#8b5cf6', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>
                ⏱️ Mi-Temps
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1, padding: '8px', background: '#1a1a1a', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#888' }}>Domicile</div>
                  <div style={{ fontWeight: 'bold', color: '#f97316' }}>{match.advancedPredictions.halfTime.home}%</div>
                </div>
                <div style={{ flex: 1, padding: '8px', background: '#eab30815', borderRadius: '4px', textAlign: 'center', border: '1px solid #eab30830' }}>
                  <div style={{ fontSize: '10px', color: '#888' }}>Nul</div>
                  <div style={{ fontWeight: 'bold', color: '#eab308' }}>{match.advancedPredictions.halfTime.draw}%</div>
                </div>
                <div style={{ flex: 1, padding: '8px', background: '#1a1a1a', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#888' }}>Extérieur</div>
                  <div style={{ fontWeight: 'bold', color: '#3b82f6' }}>{match.advancedPredictions.halfTime.away}%</div>
                </div>
              </div>
            </div>)}
          
          {/* VALEUR GLOBALE */}
          <div style={{
                marginTop: '8px',
                padding: '8px',
                background: 'linear-gradient(135deg, #f9731620, #22c55e20)',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
            <span style={{ fontSize: '10px', color: '#888' }}>📊 Indice de valeur</span>
            <span style={{
                fontWeight: 'bold',
                fontSize: '14px',
                color: successRate >= 65 ? '#22c55e' : successRate >= 50 ? '#f97316' : '#ef4444'
            }}>
              {successRate >= 65 ? '⭐⭐⭐' : successRate >= 55 ? '⭐⭐' : successRate >= 45 ? '⭐' : '⚠️'} {successRate}%
            </span>
          </div>
        </div>)}
    </div>);
}
// Section Anti-Trap
function AntiTrapSection(_a) {
    var matches = _a.matches;
    // Détecter les pièges potentiels
    var trapMatches = matches.slice(0, 5).map(function (match) {
        var homeOdds = match.oddsHome;
        var awayOdds = match.oddsAway;
        var disparity = Math.abs(homeOdds - awayOdds);
        var trapInfo = {
            isTrap: false,
            trapType: '',
            explanation: '',
            recommendation: '',
        };
        if (homeOdds < 1.3 || awayOdds < 1.3) {
            trapInfo = {
                isTrap: true,
                trapType: 'Piège Favori',
                explanation: "Cote ultra-basse (".concat(Math.min(homeOdds, awayOdds).toFixed(2), ") - gains minimes pour risque pr\u00E9sent"),
                recommendation: 'Éviter ou miser très petit',
            };
        }
        else if (disparity > 3 && (homeOdds < 1.6 || awayOdds < 1.6)) {
            trapInfo = {
                isTrap: true,
                trapType: 'Écart Trompeur',
                explanation: "Grand \u00E9cart de cotes (".concat(disparity.toFixed(1), ") - favori potentiellement sur\u00E9valu\u00E9"),
                recommendation: 'Considérer une protection',
            };
        }
        else if (awayOdds < homeOdds && awayOdds < 1.9) {
            trapInfo = {
                isTrap: true,
                trapType: 'Favori Extérieur',
                explanation: 'Favori à l\'extérieur - souvent piégeux',
                recommendation: 'Analyser la forme récente',
            };
        }
        return __assign(__assign({}, match), { trapInfo: trapInfo });
    }).filter(function (m) { return m.trapInfo.isTrap; });
    if (trapMatches.length === 0) {
        return (<div style={{
                background: '#111',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid #22c55e30',
                marginTop: '24px'
            }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{
                padding: '8px',
                borderRadius: '8px',
                background: '#22c55e20'
            }}>
            <span style={{ fontSize: '20px' }}>🛡️</span>
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Anti-Trap</h3>
            <span style={{ fontSize: '12px', color: '#888' }}>Détection des pièges des bookmakers</span>
          </div>
        </div>
        <div style={{
                textAlign: 'center',
                padding: '20px',
                background: '#22c55e10',
                borderRadius: '8px'
            }}>
          <span style={{ fontSize: '32px' }}>✅</span>
          <p style={{ color: '#22c55e', fontWeight: 'bold', marginTop: '8px', marginBottom: '4px' }}>
            Aucun piège détecté
          </p>
          <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>
            Tous les matchs présentent un profil normal
          </p>
        </div>
      </div>);
    }
    return (<div style={{
            background: '#111',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid #ef444430',
            marginTop: '24px'
        }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{
            padding: '8px',
            borderRadius: '8px',
            background: '#ef444420'
        }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
        </div>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            Anti-Trap
            <span style={{
            background: '#ef4444',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px'
        }}>ALERTE</span>
          </h3>
          <span style={{ fontSize: '12px', color: '#888' }}>{trapMatches.length} piège(s) détecté(s)</span>
        </div>
      </div>
      
      <div style={{ display: 'grid', gap: '12px' }}>
        {trapMatches.map(function (match, idx) { return (<div key={idx} style={{
                background: 'linear-gradient(135deg, #1a0a0a 0%, #1a1a1a 100%)',
                borderRadius: '8px',
                padding: '16px',
                border: '1px solid #ef444420'
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ flex: '1', minWidth: '200px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{
                background: '#ef444420',
                color: '#ef4444',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 'bold'
            }}>
                    {match.trapInfo.trapType}
                  </span>
                </div>
                <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  {match.homeTeam} vs {match.awayTeam}
                </p>
                <p style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>
                  {match.trapInfo.explanation}
                </p>
                <p style={{ fontSize: '12px', color: '#f97316' }}>
                  💡 {match.trapInfo.recommendation}
                </p>
              </div>
              <div style={{
                textAlign: 'center',
                background: '#222',
                padding: '8px 12px',
                borderRadius: '6px'
            }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Cotes</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                  <span style={{ color: '#f97316' }}>{formatOdds(match.oddsHome)}</span>
                  {match.oddsDraw != null && typeof match.oddsDraw === 'number' && <span style={{ color: '#666' }}> | {formatOdds(match.oddsDraw)} | </span>}
                  <span>{formatOdds(match.oddsAway)}</span>
                </div>
              </div>
            </div>
          </div>); })}
      </div>
      
      {/* Tips */}
      <div style={{
            marginTop: '16px',
            padding: '12px',
            background: '#1a1a1a',
            borderRadius: '8px',
            borderTop: '1px solid #333'
        }}>
        <p style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#f97316' }}>
          📌 Comment repérer les pièges:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', fontSize: '12px' }}>
          <div style={{ color: '#888' }}>• Cotes très basses (&lt;1.3) = piège à éviter</div>
          <div style={{ color: '#888' }}>• Grands écarts = favori surévalué</div>
          <div style={{ color: '#888' }}>• Favori extérieur = attention aux surprises</div>
          <div style={{ color: '#888' }}>• Cotes similaires = match imprévisible</div>
        </div>
      </div>
    </div>);
}
// Section Bankroll Manager
function BankrollSection() {
    var _a = (0, react_1.useState)(0), balance = _a[0], setBalance = _a[1];
    var _b = (0, react_1.useState)(false), showForm = _b[0], setShowForm = _b[1];
    var _c = (0, react_1.useState)(''), amount = _c[0], setAmount = _c[1];
    var _d = (0, react_1.useState)('deposit'), type = _d[0], setType = _d[1];
    var _e = (0, react_1.useState)([]), transactions = _e[0], setTransactions = _e[1];
    var handleAddTransaction = function (e) {
        e.preventDefault();
        if (!amount)
            return;
        var amt = parseFloat(amount);
        var newTx = {
            id: Date.now(),
            type: type,
            amount: amt,
            date: new Date().toISOString(),
            desc: type === 'deposit' ? 'Dépôt' : type === 'bet' ? 'Pari placé' : type === 'winning' ? 'Gain' : 'Retrait'
        };
        setTransactions(function (prev) { return __spreadArray([newTx], prev, true); });
        if (type === 'deposit' || type === 'winning') {
            setBalance(function (prev) { return prev + amt; });
        }
        else {
            setBalance(function (prev) { return prev - amt; });
        }
        setAmount('');
        setShowForm(false);
    };
    var totalBets = transactions.filter(function (t) { return t.type === 'bet'; }).reduce(function (a, b) { return a + b.amount; }, 0);
    var totalWinnings = transactions.filter(function (t) { return t.type === 'winning'; }).reduce(function (a, b) { return a + b.amount; }, 0);
    var profit = totalWinnings - totalBets;
    var roi = totalBets > 0 ? ((profit / totalBets) * 100).toFixed(1) : '0.0';
    return (<div style={{
            background: '#111',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid #f9731630',
            marginTop: '24px'
        }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            padding: '8px',
            borderRadius: '8px',
            background: '#f9731620'
        }}>
            <span style={{ fontSize: '20px' }}>💰</span>
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Bankroll Manager</h3>
            <span style={{ fontSize: '12px', color: '#888' }}>Gérez votre capital</span>
          </div>
        </div>
        <button onClick={function () { return setShowForm(!showForm); }} style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: '#f97316',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 'bold'
        }}>
          + Transaction
        </button>
      </div>

      {/* Balance Card */}
      <div style={{
            background: 'linear-gradient(135deg, #1a1a1a 0%, #2a1a0a 100%)',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        }}>
        <div>
          <p style={{ fontSize: '13px', color: '#888', margin: '0 0 4px 0' }}>Solde actuel</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#f97316', margin: 0 }}>
            {balance.toFixed(2)} €
          </p>
          {parseFloat(roi) !== 0 && (<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
              <span style={{
                background: profit >= 0 ? '#22c55e20' : '#ef444420',
                color: profit >= 0 ? '#22c55e' : '#ef4444',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold'
            }}>
                {profit >= 0 ? '↑' : '↓'} {roi}% ROI
              </span>
              <span style={{ fontSize: '12px', color: '#888' }}>
                {profit >= 0 ? '+' : ''}{profit.toFixed(2)} € profit
              </span>
            </div>)}
        </div>
        <div style={{ fontSize: '40px' }}>🏦</div>
      </div>

      {/* Add Transaction Form */}
      {showForm && (<form onSubmit={handleAddTransaction} style={{
                background: '#1a1a1a',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px'
            }}>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#888', marginBottom: '4px' }}>Type</label>
              <select value={type} onChange={function (e) { return setType(e.target.value); }} style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #333',
                background: '#0a0a0a',
                color: '#fff',
                fontSize: '14px'
            }}>
                <option value="deposit">Dépôt</option>
                <option value="bet">Pari</option>
                <option value="winning">Gain</option>
                <option value="withdrawal">Retrait</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#888', marginBottom: '4px' }}>Montant (€)</label>
              <input type="number" step="0.01" value={amount} onChange={function (e) { return setAmount(e.target.value); }} placeholder="0.00" style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #333',
                background: '#0a0a0a',
                color: '#fff',
                fontSize: '14px',
                boxSizing: 'border-box'
            }}/>
            </div>
            <button type="submit" disabled={!amount} style={{
                padding: '12px',
                borderRadius: '6px',
                border: 'none',
                background: amount ? '#f97316' : '#333',
                color: '#fff',
                cursor: amount ? 'pointer' : 'not-allowed',
                fontWeight: 'bold'
            }}>
              Enregistrer
            </button>
          </div>
        </form>)}

      {/* Stats */}
      <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '12px',
            marginBottom: '16px'
        }}>
        <div style={{ background: '#1a1a1a', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#22c55e' }}>Dépôts</div>
          <div style={{ fontWeight: 'bold' }}>
            {transactions.filter(function (t) { return t.type === 'deposit'; }).reduce(function (a, b) { return a + b.amount; }, 0).toFixed(2)} €
          </div>
        </div>
        <div style={{ background: '#1a1a1a', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#ef4444' }}>Paris</div>
          <div style={{ fontWeight: 'bold' }}>{totalBets.toFixed(2)} €</div>
        </div>
        <div style={{ background: '#1a1a1a', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#22c55e' }}>Gains</div>
          <div style={{ fontWeight: 'bold' }}>{totalWinnings.toFixed(2)} €</div>
        </div>
        <div style={{ background: '#1a1a1a', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#f97316' }}>Retraits</div>
          <div style={{ fontWeight: 'bold' }}>
            {transactions.filter(function (t) { return t.type === 'withdrawal'; }).reduce(function (a, b) { return a + b.amount; }, 0).toFixed(2)} €
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <p style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>📜 Historique</p>
        <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
          {transactions.slice(0, 5).map(function (tx) { return (<div key={tx.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px',
                borderBottom: '1px solid #222',
                fontSize: '13px'
            }}>
              <div>
                <span style={{
                color: tx.type === 'deposit' || tx.type === 'winning' ? '#22c55e' : '#ef4444'
            }}>
                  {tx.type === 'deposit' || tx.type === 'winning' ? '+' : '-'}{tx.amount.toFixed(2)} €
                </span>
                <span style={{ color: '#666', marginLeft: '8px', fontSize: '11px' }}>{tx.desc}</span>
              </div>
              <span style={{ color: '#666', fontSize: '11px' }}>
                {new Date(tx.date).toLocaleDateString('fr-FR')}
              </span>
            </div>); })}
        </div>
      </div>
    </div>);
}
// Section Résultats - Stats réelles avec séparation Foot/Basket et Expert Advisor
function ResultsSection() {
    var _this = this;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31, _32, _33, _34, _35, _36, _37, _38, _39, _40, _41, _42, _43, _44, _45;
    var _46 = (0, react_1.useState)('yesterday'), activePeriod = _46[0], setActivePeriod = _46[1];
    var _47 = (0, react_1.useState)('all'), activeSport = _47[0], setActiveSport = _47[1];
    var _48 = (0, react_1.useState)(null), stats = _48[0], setStats = _48[1];
    var _49 = (0, react_1.useState)(true), loading = _49[0], setLoading = _49[1];
    var _50 = (0, react_1.useState)(null), lastUpdate = _50[0], setLastUpdate = _50[1];
    // Charger les vraies stats depuis l'API
    var fetchStats = (0, react_1.useCallback)(function () { return __awaiter(_this, void 0, void 0, function () {
        var response, data, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, 4, 5]);
                    return [4 /*yield*/, fetch('/api/results?action=stats')];
                case 1:
                    response = _a.sent();
                    return [4 /*yield*/, response.json()];
                case 2:
                    data = _a.sent();
                    if (data.daily || data.weekly || data.monthly || data.overall) {
                        setStats({
                            daily: data.daily,
                            weekly: data.weekly,
                            monthly: data.monthly,
                            overall: data.overall,
                            // Stats par sport depuis la nouvelle structure
                            bySport: data.bySport || {
                                football: { total: 0, wins: 0, losses: 0, winRate: 0 },
                                basketball: { total: 0, wins: 0, losses: 0, winRate: 0 },
                                hockey: { total: 0, wins: 0, losses: 0, winRate: 0 }
                            },
                            // Expert Advisor stats
                            expertAdvisor: data.expertAdvisor || null
                        });
                    }
                    setLastUpdate(new Date());
                    return [3 /*break*/, 5];
                case 3:
                    error_2 = _a.sent();
                    console.error('Erreur chargement stats:', error_2);
                    return [3 /*break*/, 5];
                case 4:
                    setLoading(false);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    }); }, []);
    (0, react_1.useEffect)(function () {
        void (function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetchStats()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        }); }); })();
    }, [fetchStats]);
    var periodKey = activePeriod === 'yesterday' ? 'daily'
        : activePeriod === 'week' ? 'weekly'
            : 'monthly';
    var periodLabels = {
        yesterday: { label: 'Hier', icon: '📅', date: 'Pronostics de la veille' },
        week: { label: 'Semaine', icon: '📆', date: '7 derniers jours' },
        month: { label: 'Mois', icon: '🗓️', date: '30 derniers jours' }
    };
    var sportLabels = {
        all: { label: 'Tous', icon: '📊' },
        football: { label: 'Foot', icon: '⚽' },
        basketball: { label: 'Basket', icon: '🏀' }
    };
    if (loading) {
        return (<div style={{
                background: '#111',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid #8b5cf630',
                textAlign: 'center'
            }}>
        <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
        <div style={{ color: '#888', fontSize: '13px' }}>Chargement des statistiques...</div>
      </div>);
    }
    // Obtenir les stats selon le filtre sport
    var getFilteredStats = function () {
        if (!stats || !stats[periodKey])
            return null;
        if (activeSport === 'all') {
            return stats[periodKey];
        }
        // Utiliser les stats bySport si disponibles
        if (stats.bySport && stats.bySport[activeSport]) {
            var sportStats = stats.bySport[activeSport];
            return {
                totalPredictions: sportStats.total || 0,
                completed: sportStats.total || 0,
                wins: sportStats.wins || 0,
                losses: sportStats.losses || 0,
                winRate: sportStats.winRate || 0
            };
        }
        // Fallback: filtrer depuis les stats globales
        return stats[periodKey];
    };
    var periodStats = getFilteredStats();
    // Stats de l'Expert Advisor
    var expertStats = (stats === null || stats === void 0 ? void 0 : stats.expertAdvisor) || ((_a = stats === null || stats === void 0 ? void 0 : stats.overall) === null || _a === void 0 ? void 0 : _a.expertAdvisor) || null;
    if (!periodStats || periodStats.totalPredictions === 0) {
        return (<div style={{
                background: '#111',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid #8b5cf630'
            }}>
        {/* Filtres Sport */}
        <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '4px',
                marginBottom: '12px',
                flexWrap: 'wrap'
            }}>
          {Object.entries(sportLabels).map(function (_a) {
                var key = _a[0], value = _a[1];
                return (<button key={key} onClick={function () { return setActiveSport(key); }} style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: activeSport === key ? '#f97316' : '#1a1a1a',
                        color: activeSport === key ? '#fff' : '#888',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
              <span>{value.icon}</span> {value.label}
            </button>);
            })}
        </div>

        {/* Filtres Période */}
        <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '6px',
                marginBottom: '20px',
                flexWrap: 'wrap'
            }}>
          {Object.entries(periodLabels).map(function (_a) {
                var key = _a[0], value = _a[1];
                return (<button key={key} onClick={function () { return setActivePeriod(key); }} style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        background: activePeriod === key ? '#8b5cf6' : '#1a1a1a',
                        color: activePeriod === key ? '#fff' : '#888',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
              <span>{value.icon}</span> {value.label}
            </button>);
            })}
        </div>

        <div style={{
                background: 'linear-gradient(135deg, #1a1a2a 0%, #2a1a3a 100%)',
                borderRadius: '12px',
                padding: '40px 20px',
                textAlign: 'center',
                border: '1px solid #8b5cf650'
            }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#8b5cf6', marginBottom: '8px' }}>
            En attente des résultats
          </div>
          <div style={{ fontSize: '13px', color: '#888', marginBottom: '16px' }}>
            Les statistiques {periodLabels[activePeriod].label.toLowerCase()} {activeSport !== 'all' ? "pour le ".concat(sportLabels[activeSport].label) : ''} seront disponibles après vérification des matchs.
          </div>
          <div style={{
                fontSize: '11px',
                color: '#666',
                padding: '8px 12px',
                background: '#1a1a1a',
                borderRadius: '6px',
                display: 'inline-block'
            }}>
            🕒 Vérification automatique chaque jour à 7h (heure de Paris)
          </div>
        </div>
      </div>);
    }
    // Déterminer si c'est du basket pour adapter l'affichage
    var isBasketball = activeSport === 'basketball';
    return (<div style={{
            background: '#111',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid #8b5cf630'
        }}>
      {/* Filtres Sport */}
      <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '4px',
            marginBottom: '12px',
            flexWrap: 'wrap'
        }}>
        {Object.entries(sportLabels).map(function (_a) {
            var key = _a[0], value = _a[1];
            return (<button key={key} onClick={function () { return setActiveSport(key); }} style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeSport === key ? '#f97316' : '#1a1a1a',
                    color: activeSport === key ? '#fff' : '#888',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                }}>
            <span>{value.icon}</span> {value.label}
          </button>);
        })}
      </div>

      {/* Filtres Période */}
      <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '6px',
            marginBottom: '20px',
            flexWrap: 'wrap'
        }}>
        {Object.entries(periodLabels).map(function (_a) {
            var key = _a[0], value = _a[1];
            return (<button key={key} onClick={function () { return setActivePeriod(key); }} style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: activePeriod === key ? '#8b5cf6' : '#1a1a1a',
                    color: activePeriod === key ? '#fff' : '#888',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}>
            <span>{value.icon}</span> {value.label}
          </button>);
        })}
      </div>

      <div style={{
            textAlign: 'center',
            marginBottom: '20px',
            padding: '16px',
            background: 'linear-gradient(135deg, #1a1a2a 0%, #2a1a3a 100%)',
            borderRadius: '10px'
        }}>
        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#8b5cf6', marginBottom: '4px' }}>
          📈 Statistiques {sportLabels[activeSport].label} - {periodLabels[activePeriod].label}
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>
          {periodLabels[activePeriod].date}
        </div>
      </div>

      <div style={{
            background: 'linear-gradient(135deg, #1a1a1a 0%, #2a1a3a 100%)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px',
            textAlign: 'center',
            border: '1px solid #8b5cf650'
        }}>
        <div style={{ fontSize: '14px', color: '#888', marginBottom: '8px' }}>🎯 Taux de Réussite {activeSport !== 'all' ? sportLabels[activeSport].label : 'Global'}</div>
        <div style={{
            fontSize: '48px',
            fontWeight: 'bold',
            color: periodStats.winRate >= 65 ? '#22c55e' : periodStats.winRate >= 55 ? '#eab308' : '#ef4444'
        }}>
          {periodStats.winRate}%
        </div>
        <div style={{ fontSize: '13px', color: '#666', marginTop: '8px' }}>
          {periodStats.wins}/{periodStats.completed} pronostics vérifiés
        </div>
        {lastUpdate && (<div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>
            Mis à jour: {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>)}
      </div>

      {/* Stats différenciées selon le sport */}
      <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '10px',
            marginBottom: '16px'
        }}>
        {isBasketball ? (
        // Stats Basket
        <>
            <div style={{
                background: '#0d0d0d',
                borderRadius: '10px',
                padding: '14px',
                border: '1px solid #f9731630'
            }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>🏀 Vainqueurs</div>
              <div style={{
                fontSize: '28px',
                fontWeight: 'bold',
                color: ((_b = periodStats.results) === null || _b === void 0 ? void 0 : _b.rate) >= 60 ? '#22c55e' : '#eab308'
            }}>
                {((_c = periodStats.results) === null || _c === void 0 ? void 0 : _c.rate) || 0}%
              </div>
              <div style={{ fontSize: '11px', color: '#666' }}>
                {((_d = periodStats.results) === null || _d === void 0 ? void 0 : _d.correct) || 0}/{((_e = periodStats.results) === null || _e === void 0 ? void 0 : _e.total) || 0} corrects
              </div>
            </div>

            <div style={{
                background: '#0d0d0d',
                borderRadius: '10px',
                padding: '14px',
                border: '1px solid #3b82f630'
            }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>📈 Total Points O/U</div>
              <div style={{
                fontSize: '28px',
                fontWeight: 'bold',
                color: ((_f = periodStats.goals) === null || _f === void 0 ? void 0 : _f.rate) >= 60 ? '#22c55e' : '#eab308'
            }}>
                {((_g = periodStats.goals) === null || _g === void 0 ? void 0 : _g.rate) || 0}%
              </div>
              <div style={{ fontSize: '11px', color: '#666' }}>
                {((_h = periodStats.goals) === null || _h === void 0 ? void 0 : _h.correct) || 0}/{((_j = periodStats.goals) === null || _j === void 0 ? void 0 : _j.total) || 0} corrects
              </div>
            </div>
          </>) : (
        // Stats Foot avec détails
        <>
            <div style={{
                background: '#0d0d0d',
                borderRadius: '10px',
                padding: '14px',
                border: '1px solid #22c55e30'
            }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>🏆 Résultats 1N2</div>
              <div style={{
                fontSize: '28px',
                fontWeight: 'bold',
                color: (((_o = (_m = (_l = (_k = stats === null || stats === void 0 ? void 0 : stats.bySport) === null || _k === void 0 ? void 0 : _k.football) === null || _l === void 0 ? void 0 : _l.details) === null || _m === void 0 ? void 0 : _m.resultats) === null || _o === void 0 ? void 0 : _o.winRate) || ((_p = periodStats.results) === null || _p === void 0 ? void 0 : _p.rate) || 0) >= 60 ? '#22c55e' : '#eab308'
            }}>
                {((_t = (_s = (_r = (_q = stats === null || stats === void 0 ? void 0 : stats.bySport) === null || _q === void 0 ? void 0 : _q.football) === null || _r === void 0 ? void 0 : _r.details) === null || _s === void 0 ? void 0 : _s.resultats) === null || _t === void 0 ? void 0 : _t.winRate) || ((_u = periodStats.results) === null || _u === void 0 ? void 0 : _u.rate) || 0}%
              </div>
              <div style={{ fontSize: '11px', color: '#666' }}>
                {((_y = (_x = (_w = (_v = stats === null || stats === void 0 ? void 0 : stats.bySport) === null || _v === void 0 ? void 0 : _v.football) === null || _w === void 0 ? void 0 : _w.details) === null || _x === void 0 ? void 0 : _x.resultats) === null || _y === void 0 ? void 0 : _y.wins) || ((_z = periodStats.results) === null || _z === void 0 ? void 0 : _z.correct) || 0}/{((_3 = (_2 = (_1 = (_0 = stats === null || stats === void 0 ? void 0 : stats.bySport) === null || _0 === void 0 ? void 0 : _0.football) === null || _1 === void 0 ? void 0 : _1.details) === null || _2 === void 0 ? void 0 : _2.resultats) === null || _3 === void 0 ? void 0 : _3.total) || ((_4 = periodStats.results) === null || _4 === void 0 ? void 0 : _4.total) || 0} corrects
              </div>
            </div>

            <div style={{
                background: '#0d0d0d',
                borderRadius: '10px',
                padding: '14px',
                border: '1px solid #3b82f630'
            }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>⚽ Buts O/U</div>
              <div style={{
                fontSize: '28px',
                fontWeight: 'bold',
                color: (((_8 = (_7 = (_6 = (_5 = stats === null || stats === void 0 ? void 0 : stats.bySport) === null || _5 === void 0 ? void 0 : _5.football) === null || _6 === void 0 ? void 0 : _6.details) === null || _7 === void 0 ? void 0 : _7.buts) === null || _8 === void 0 ? void 0 : _8.winRate) || ((_9 = periodStats.goals) === null || _9 === void 0 ? void 0 : _9.rate) || 0) >= 60 ? '#22c55e' : '#eab308'
            }}>
                {((_13 = (_12 = (_11 = (_10 = stats === null || stats === void 0 ? void 0 : stats.bySport) === null || _10 === void 0 ? void 0 : _10.football) === null || _11 === void 0 ? void 0 : _11.details) === null || _12 === void 0 ? void 0 : _12.buts) === null || _13 === void 0 ? void 0 : _13.winRate) || ((_14 = periodStats.goals) === null || _14 === void 0 ? void 0 : _14.rate) || 0}%
              </div>
              <div style={{ fontSize: '11px', color: '#666' }}>
                {((_18 = (_17 = (_16 = (_15 = stats === null || stats === void 0 ? void 0 : stats.bySport) === null || _15 === void 0 ? void 0 : _15.football) === null || _16 === void 0 ? void 0 : _16.details) === null || _17 === void 0 ? void 0 : _17.buts) === null || _18 === void 0 ? void 0 : _18.wins) || ((_19 = periodStats.goals) === null || _19 === void 0 ? void 0 : _19.correct) || 0}/{((_23 = (_22 = (_21 = (_20 = stats === null || stats === void 0 ? void 0 : stats.bySport) === null || _20 === void 0 ? void 0 : _20.football) === null || _21 === void 0 ? void 0 : _21.details) === null || _22 === void 0 ? void 0 : _22.buts) === null || _23 === void 0 ? void 0 : _23.total) || ((_24 = periodStats.goals) === null || _24 === void 0 ? void 0 : _24.total) || 0} corrects
              </div>
            </div>
            
            {/* BTTS - Les deux marquent */}
            {(((_28 = (_27 = (_26 = (_25 = stats === null || stats === void 0 ? void 0 : stats.bySport) === null || _25 === void 0 ? void 0 : _25.football) === null || _26 === void 0 ? void 0 : _26.details) === null || _27 === void 0 ? void 0 : _27.btts) === null || _28 === void 0 ? void 0 : _28.total) > 0) && (<div style={{
                    background: '#0d0d0d',
                    borderRadius: '10px',
                    padding: '14px',
                    border: '1px solid #14b8a630',
                    gridColumn: 'span 2'
                }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>🎯 BTTS (Les 2 marquent)</div>
                <div style={{
                    fontSize: '28px',
                    fontWeight: 'bold',
                    color: (((_32 = (_31 = (_30 = (_29 = stats === null || stats === void 0 ? void 0 : stats.bySport) === null || _29 === void 0 ? void 0 : _29.football) === null || _30 === void 0 ? void 0 : _30.details) === null || _31 === void 0 ? void 0 : _31.btts) === null || _32 === void 0 ? void 0 : _32.winRate) || 0) >= 60 ? '#22c55e' : '#eab308'
                }}>
                  {((_36 = (_35 = (_34 = (_33 = stats === null || stats === void 0 ? void 0 : stats.bySport) === null || _33 === void 0 ? void 0 : _33.football) === null || _34 === void 0 ? void 0 : _34.details) === null || _35 === void 0 ? void 0 : _35.btts) === null || _36 === void 0 ? void 0 : _36.winRate) || 0}%
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  {((_40 = (_39 = (_38 = (_37 = stats === null || stats === void 0 ? void 0 : stats.bySport) === null || _37 === void 0 ? void 0 : _37.football) === null || _38 === void 0 ? void 0 : _38.details) === null || _39 === void 0 ? void 0 : _39.btts) === null || _40 === void 0 ? void 0 : _40.wins) || 0}/{((_44 = (_43 = (_42 = (_41 = stats === null || stats === void 0 ? void 0 : stats.bySport) === null || _41 === void 0 ? void 0 : _41.football) === null || _42 === void 0 ? void 0 : _42.details) === null || _43 === void 0 ? void 0 : _43.btts) === null || _44 === void 0 ? void 0 : _44.total) || 0} corrects
                </div>
              </div>)}
          </>)}
      </div>

      <div style={{
            background: '#0d0d0d',
            borderRadius: '10px',
            padding: '14px',
            border: '1px solid #f9731630'
        }}>
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px'
        }}>
          <span style={{ fontSize: '13px', color: '#f97316', fontWeight: 'bold' }}>📊 Résumé {activeSport !== 'all' ? sportLabels[activeSport].label : ''}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>
              {periodStats.totalPredictions}
            </div>
            <div style={{ fontSize: '10px', color: '#666' }}>Total</div>
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#eab308' }}>
              {periodStats.pending}
            </div>
            <div style={{ fontSize: '10px', color: '#666' }}>En attente</div>
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#22c55e' }}>
              {periodStats.completed}
            </div>
            <div style={{ fontSize: '10px', color: '#666' }}>Vérifiés</div>
          </div>
        </div>
      </div>

      {/* Expert Advisor Ratio - NOUVEAU */}
      {expertStats && expertStats.total > 0 && (<div style={{
                background: 'linear-gradient(135deg, #1a1a2a 0%, #14b8a615 100%)',
                borderRadius: '10px',
                padding: '16px',
                marginTop: '16px',
                border: '1px solid #14b8a640'
            }}>
          <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
            <span style={{ fontSize: '14px', color: '#14b8a6', fontWeight: 'bold' }}>🎯 Ratio Expert Advisor</span>
            <span style={{
                background: expertStats.winRate >= 65 ? '#22c55e' : expertStats.winRate >= 55 ? '#eab308' : '#ef4444',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold'
            }}>
              {expertStats.winRate}% réussite
            </span>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', textAlign: 'center' }}>
            <div style={{ background: '#0d0d0d', borderRadius: '8px', padding: '10px' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#14b8a6' }}>
                {expertStats.total}
              </div>
              <div style={{ fontSize: '9px', color: '#666' }}>Conseils</div>
            </div>
            <div style={{ background: '#0d0d0d', borderRadius: '8px', padding: '10px' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#22c55e' }}>
                {expertStats.wins}
              </div>
              <div style={{ fontSize: '9px', color: '#666' }}>Gagnés</div>
            </div>
            <div style={{ background: '#0d0d0d', borderRadius: '8px', padding: '10px' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444' }}>
                {expertStats.losses}
              </div>
              <div style={{ fontSize: '9px', color: '#666' }}>Perdus</div>
            </div>
            <div style={{ background: '#0d0d0d', borderRadius: '8px', padding: '10px' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#3b82f6' }}>
                {((_45 = expertStats.highConfidence) === null || _45 === void 0 ? void 0 : _45.winRate) || 0}%
              </div>
              <div style={{ fontSize: '9px', color: '#666' }}>Haute Conf.</div>
            </div>
          </div>
          
          {expertStats.highConfidence && expertStats.highConfidence.total > 0 && (<div style={{
                    marginTop: '10px',
                    padding: '10px',
                    background: '#0d0d0d',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: '#888'
                }}>
              <span style={{ color: '#14b8a6', fontWeight: 'bold' }}>💡 Conseils haute confiance:</span>{' '}
              {expertStats.highConfidence.wins}/{expertStats.highConfidence.total} réussis 
              ({expertStats.highConfidence.winRate}%)
            </div>)}
        </div>)}

      {/* Stats par Sport - NOUVEAU */}
      {(stats === null || stats === void 0 ? void 0 : stats.bySport) && activeSport === 'all' && (<div style={{
                marginTop: '16px',
                background: '#0d0d0d',
                borderRadius: '10px',
                padding: '14px',
                border: '1px solid #333'
            }}>
          <div style={{ fontSize: '13px', color: '#f97316', fontWeight: 'bold', marginBottom: '12px' }}>
            📊 Répartition par Sport
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {stats.bySport.football && stats.bySport.football.total > 0 && (<div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px', textAlign: 'center', border: '1px solid #22c55e30' }}>
                <div style={{ fontSize: '16px', marginBottom: '4px' }}>⚽</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: stats.bySport.football.winRate >= 60 ? '#22c55e' : '#eab308' }}>
                  {stats.bySport.football.winRate}%
                </div>
                <div style={{ fontSize: '10px', color: '#888' }}>
                  {stats.bySport.football.wins}/{stats.bySport.football.total} Foot
                </div>
              </div>)}
            {stats.bySport.basketball && stats.bySport.basketball.total > 0 && (<div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px', textAlign: 'center', border: '1px solid #f9731630' }}>
                <div style={{ fontSize: '16px', marginBottom: '4px' }}>🏀</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: stats.bySport.basketball.winRate >= 60 ? '#22c55e' : '#eab308' }}>
                  {stats.bySport.basketball.winRate}%
                </div>
                <div style={{ fontSize: '10px', color: '#888' }}>
                  {stats.bySport.basketball.wins}/{stats.bySport.basketball.total} Basket
                </div>
              </div>)}
            {stats.bySport.hockey && stats.bySport.hockey.total > 0 && (<div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px', textAlign: 'center', border: '1px solid #3b82f630' }}>
                <div style={{ fontSize: '16px', marginBottom: '4px' }}>🏒</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: stats.bySport.hockey.winRate >= 60 ? '#22c55e' : '#eab308' }}>
                  {stats.bySport.hockey.winRate}%
                </div>
                <div style={{ fontSize: '10px', color: '#888' }}>
                  {stats.bySport.hockey.wins}/{stats.bySport.hockey.total} Hockey
                </div>
              </div>)}
          </div>
        </div>)}
    </div>);
}
// Composant MatchCard
function MatchCard(_a) {
    var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    var match = _a.match, index = _a.index;
    var riskPercentage = (_c = (_b = match.insight) === null || _b === void 0 ? void 0 : _b.riskPercentage) !== null && _c !== void 0 ? _c : 50;
    var riskColor = riskPercentage <= 40 ? '#22c55e' : riskPercentage <= 50 ? '#f97316' : '#ef4444';
    var riskBg = riskPercentage <= 40 ? 'rgba(34,197,94,0.1)' : riskPercentage <= 50 ? 'rgba(249,115,22,0.1)' : 'rgba(239,68,68,0.1)';
    // Déterminer le favori
    var favorite = match.oddsHome < match.oddsAway ? 'home' : 'away';
    var favoriteTeam = favorite === 'home' ? match.homeTeam : match.awayTeam;
    var favoriteOdds = favorite === 'home' ? match.oddsHome : match.oddsAway;
    return (<div style={{
            background: '#111',
            borderRadius: '12px',
            padding: '16px 20px',
            border: '1px solid #1a1a1a',
            transition: 'border-color 0.2s'
        }}>
      <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '16px'
        }}>
        {/* Left: Match Info */}
        <div style={{ flex: '1', minWidth: '250px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{
            background: '#222',
            color: '#888',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '12px'
        }}>#{index}</span>
            <span style={{ fontSize: '12px', color: '#666' }}>{match.league}</span>
          </div>
          
          {/* Teams */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px'
        }}>
              <span style={{
            fontWeight: 'bold',
            color: favorite === 'home' ? '#f97316' : '#fff'
        }}>
                {favorite === 'home' && '⭐ '}{match.homeTeam}
              </span>
              <span style={{
            fontFamily: 'monospace',
            fontWeight: 'bold',
            color: favorite === 'home' ? '#f97316' : '#888'
        }}>
                {formatOdds(match.oddsHome)}
              </span>
            </div>
            
            {match.oddsDraw != null && typeof match.oddsDraw === 'number' && (<div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderTop: '1px dashed #222',
                borderBottom: '1px dashed #222',
                marginBottom: '6px'
            }}>
                <span style={{ color: '#666', fontSize: '14px' }}>Match Nul</span>
                <span style={{ fontFamily: 'monospace', color: '#666' }}>{formatOdds(match.oddsDraw)}</span>
              </div>)}
            
            <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        }}>
              <span style={{
            fontWeight: 'bold',
            color: favorite === 'away' ? '#f97316' : '#fff'
        }}>
                {favorite === 'away' && '⭐ '}{match.awayTeam}
              </span>
              <span style={{
            fontFamily: 'monospace',
            fontWeight: 'bold',
            color: favorite === 'away' ? '#f97316' : '#888'
        }}>
                {formatOdds(match.oddsAway)}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Stats */}
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '8px'
        }}>
          {/* Risk Badge */}
          <div style={{
            background: riskBg,
            color: riskColor,
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 'bold'
        }}>
            Risque: {(_e = (_d = match.insight) === null || _d === void 0 ? void 0 : _d.riskPercentage) !== null && _e !== void 0 ? _e : 50}%
          </div>
          
          {/* Confidence */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            color: '#888'
        }}>
            Confiance: 
            <span style={{
            color: ((_g = (_f = match.insight) === null || _f === void 0 ? void 0 : _f.confidence) !== null && _g !== void 0 ? _g : "medium") === 'high' ? '#22c55e' : ((_j = (_h = match.insight) === null || _h === void 0 ? void 0 : _h.confidence) !== null && _j !== void 0 ? _j : "medium") === 'medium' ? '#f97316' : '#ef4444'
        }}>
              {((_l = (_k = match.insight) === null || _k === void 0 ? void 0 : _k.confidence) !== null && _l !== void 0 ? _l : "medium") === 'high' ? '⬛⬛⬛' : ((_o = (_m = match.insight) === null || _m === void 0 ? void 0 : _m.confidence) !== null && _o !== void 0 ? _o : "medium") === 'medium' ? '⬛⬛⬜' : '⬛⬜⬜'}
            </span>
          </div>
          
          {/* Value Bet Badge */}
          {((_q = (_p = match.insight) === null || _p === void 0 ? void 0 : _p.valueBetDetected) !== null && _q !== void 0 ? _q : false) && (<div style={{
                background: 'rgba(59,130,246,0.1)',
                color: '#3b82f6',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold'
            }}>
              💰 Value Bet détecté
            </div>)}
        </div>
      </div>
      
      {/* Prédictions Buts et Cartons */}
      {(match.goalsPrediction || match.cardsPrediction) && (<div style={{
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: '1px solid #222',
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap'
            }}>
          {/* Prédiction Buts */}
          {match.goalsPrediction && (<div style={{
                    flex: '1',
                    minWidth: '200px',
                    background: '#0d0d0d',
                    borderRadius: '8px',
                    padding: '10px 12px'
                }}>
              <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '8px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: '#22c55e'
                }}>
                ⚽ Prédiction Buts
              </div>
              <div style={{
                    fontSize: '10px',
                    color: '#666',
                    marginBottom: '8px',
                    padding: '4px 8px',
                    background: '#1a1a1a',
                    borderRadius: '4px'
                }}>
                📈 Moyenne prévue: <strong style={{ color: '#fff' }}>{match.goalsPrediction.total} buts</strong> par match
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888' }}>Plus de 2.5:</span>
                  <span style={{ color: match.goalsPrediction.over25 >= 55 ? '#22c55e' : '#888', fontWeight: 'bold' }}>
                    {match.goalsPrediction.over25}%
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888' }}>Moins de 2.5:</span>
                  <span style={{ color: match.goalsPrediction.under25 >= 55 ? '#22c55e' : '#888', fontWeight: 'bold' }}>
                    {match.goalsPrediction.under25}%
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888' }}>Plus de 1.5:</span>
                  <span style={{ color: match.goalsPrediction.over15 >= 55 ? '#22c55e' : '#888', fontWeight: 'bold' }}>
                    {match.goalsPrediction.over15}%
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888' }}>Les 2 marquent:</span>
                  <span style={{ color: match.goalsPrediction.bothTeamsScore >= 55 ? '#22c55e' : '#888', fontWeight: 'bold' }}>
                    {match.goalsPrediction.bothTeamsScore}%
                  </span>
                </div>
              </div>
              <div style={{
                    marginTop: '8px',
                    padding: '6px 8px',
                    background: match.goalsPrediction.over25 >= 55 ? '#22c55e20' : '#1a1a1a',
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: match.goalsPrediction.over25 >= 55 ? '#22c55e' : '#f97316',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    border: match.goalsPrediction.over25 >= 55 ? '1px solid #22c55e30' : 'none'
                }}>
                {match.goalsPrediction.over25 >= 55
                    ? "\u2713 Recommandation: PLUS DE 2.5 BUTS (".concat(match.goalsPrediction.over25, "% de chance)")
                    : "\u2713 Recommandation: MOINS DE 2.5 BUTS (".concat(match.goalsPrediction.under25, "% de chance)")}
              </div>
            </div>)}
          
          {/* Prédiction Cartons */}
          {match.cardsPrediction && (<div style={{
                    flex: '1',
                    minWidth: '200px',
                    background: '#0d0d0d',
                    borderRadius: '8px',
                    padding: '10px 12px'
                }}>
              <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '8px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: '#eab308'
                }}>
                🟨 Prédiction Cartons
              </div>
              <div style={{
                    fontSize: '10px',
                    color: '#666',
                    marginBottom: '8px',
                    padding: '4px 8px',
                    background: '#1a1a1a',
                    borderRadius: '4px'
                }}>
                📈 Moyenne prévue: <strong style={{ color: '#fff' }}>{match.cardsPrediction.total} cartons</strong> (jaunes + rouges)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888' }}>Plus de 4.5:</span>
                  <span style={{ color: match.cardsPrediction.over45 >= 55 ? '#eab308' : '#888', fontWeight: 'bold' }}>
                    {match.cardsPrediction.over45}%
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888' }}>Moins de 4.5:</span>
                  <span style={{ color: match.cardsPrediction.under45 >= 55 ? '#eab308' : '#888', fontWeight: 'bold' }}>
                    {match.cardsPrediction.under45}%
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gridColumn: 'span 2' }}>
                  <span style={{ color: '#888' }}>Risque carton rouge:</span>
                  <span style={{ color: match.cardsPrediction.redCardRisk >= 25 ? '#ef4444' : '#888', fontWeight: 'bold' }}>
                    {match.cardsPrediction.redCardRisk}%
                  </span>
                </div>
              </div>
              <div style={{
                    marginTop: '8px',
                    padding: '6px 8px',
                    background: match.cardsPrediction.over45 >= 55 ? '#eab30820' : '#1a1a1a',
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: match.cardsPrediction.over45 >= 55 ? '#eab308' : '#f97316',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    border: match.cardsPrediction.over45 >= 55 ? '1px solid #eab30830' : 'none'
                }}>
                {match.cardsPrediction.over45 >= 55
                    ? "\u2713 Recommandation: PLUS DE 4.5 CARTONS (".concat(match.cardsPrediction.over45, "% de chance)")
                    : "\u2713 Recommandation: MOINS DE 4.5 CARTONS (".concat(match.cardsPrediction.under45, "% de chance)")}
              </div>
            </div>)}
        </div>)}
    </div>);
}
function PronostiqueurProSection() {
    var _this = this;
    var _a = (0, react_1.useState)([]), predictions = _a[0], setPredictions = _a[1];
    var _b = (0, react_1.useState)([]), allPicks = _b[0], setAllPicks = _b[1];
    var _c = (0, react_1.useState)(null), stats = _c[0], setStats = _c[1];
    var _d = (0, react_1.useState)(true), loading = _d[0], setLoading = _d[1];
    var _e = (0, react_1.useState)('safe'), activeTab = _e[0], setActiveTab = _e[1];
    var _f = (0, react_1.useState)([]), history = _f[0], setHistory = _f[1];
    (0, react_1.useEffect)(function () {
        fetchProData();
    }, []);
    var fetchProData = function () { return __awaiter(_this, void 0, void 0, function () {
        var res, data, e_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setLoading(true);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, 5, 6]);
                    return [4 /*yield*/, fetch('/api/pronostiqueur-pro?action=predictions')];
                case 2:
                    res = _a.sent();
                    return [4 /*yield*/, res.json()];
                case 3:
                    data = _a.sent();
                    setPredictions(data.predictions || []);
                    setAllPicks(data.allPicks || []);
                    setStats(data.stats || null);
                    return [3 /*break*/, 6];
                case 4:
                    e_5 = _a.sent();
                    console.error('Erreur chargement pronostiqueur pro:', e_5);
                    return [3 /*break*/, 6];
                case 5:
                    setLoading(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); };
    var fetchHistory = function () { return __awaiter(_this, void 0, void 0, function () {
        var res, data, e_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fetch('/api/pronostiqueur-pro?action=history')];
                case 1:
                    res = _a.sent();
                    return [4 /*yield*/, res.json()];
                case 2:
                    data = _a.sent();
                    setHistory(data.predictions || []);
                    setStats(data.stats || null);
                    return [3 /*break*/, 4];
                case 3:
                    e_6 = _a.sent();
                    console.error('Erreur historique:', e_6);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); };
    (0, react_1.useEffect)(function () {
        if (activeTab === 'history') {
            fetchHistory();
        }
    }, [activeTab]);
    var updateResult = function (predictionId, result) { return __awaiter(_this, void 0, void 0, function () {
        var e_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fetch('/api/pronostiqueur-pro', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                action: 'update_result',
                                predictionId: predictionId,
                                results: { result: result }
                            })
                        })];
                case 1:
                    _a.sent();
                    fetchHistory();
                    return [3 /*break*/, 3];
                case 2:
                    e_7 = _a.sent();
                    console.error('Erreur mise à jour:', e_7);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); };
    var filteredPredictions = predictions.filter(function (p) { return p.type === activeTab; });
    var typeColors = {
        safe: '#22c55e',
        fun: '#f97316',
        combo: '#8b5cf6'
    };
    var typeLabels = {
        safe: '🛡️ SAFES',
        fun: '🎯 FUN',
        combo: '🔗 COMBO'
    };
    var typeDescriptions = {
        safe: 'Paris à faible risque - Cotes ≤ 1.80, Confiance ≥ 70%',
        fun: 'Paris valeur avec risque maîtrisé - Valeur positive requise',
        combo: 'Combinaisons optimisées Safe + Fun'
    };
    return (<div style={{ marginBottom: '12px' }}>
      {/* Header */}
      <div style={{ marginBottom: '12px' }}>
        <h2 style={{
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#f97316',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }}>
          🎯 Pronostiqueur Pro
        </h2>
        <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
          Système ML avec apprentissage - Combinaisons optimisées Safe & Fun
        </p>
      </div>

      {/* Stats globales */}
      {stats && (<div style={{
                background: 'linear-gradient(135deg, #1a1a1a 0%, #f9731615 100%)',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px',
                border: '1px solid #f9731630'
            }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f97316' }}>{stats.totalPredictions}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>Total</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#22c55e' }}>{stats.won}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>Gagnés</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#22c55e' }}>{stats.winRate.toFixed(1)}%</div>
              <div style={{ fontSize: '9px', color: '#888' }}>Win Rate</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: stats.roi >= 0 ? '#22c55e' : '#ef4444' }}>
                {stats.roi >= 0 ? '+' : ''}{stats.roi.toFixed(1)}%
              </div>
              <div style={{ fontSize: '9px', color: '#888' }}>ROI</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: stats.profit >= 0 ? '#22c55e' : '#ef4444' }}>
                {stats.profit >= 0 ? '+' : ''}{stats.profit.toFixed(0)}€
              </div>
              <div style={{ fontSize: '9px', color: '#888' }}>Profit</div>
            </div>
          </div>

          {/* Stats par type */}
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #333' }}>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', padding: '6px 12px', background: '#22c55e15', borderRadius: '6px' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#22c55e' }}>{stats.byType.safe.winRate.toFixed(0)}%</div>
                <div style={{ fontSize: '9px', color: '#888' }}>Safe ({stats.byType.safe.total})</div>
              </div>
              <div style={{ textAlign: 'center', padding: '6px 12px', background: '#f9731615', borderRadius: '6px' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#f97316' }}>{stats.byType.fun.winRate.toFixed(0)}%</div>
                <div style={{ fontSize: '9px', color: '#888' }}>Fun ({stats.byType.fun.total})</div>
              </div>
              <div style={{ textAlign: 'center', padding: '6px 12px', background: '#8b5cf615', borderRadius: '6px' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#8b5cf6' }}>{stats.byType.combo.winRate.toFixed(0)}%</div>
                <div style={{ fontSize: '9px', color: '#888' }}>Combo ({stats.byType.combo.total})</div>
              </div>
            </div>
          </div>
        </div>)}

      {/* Onglets */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {['safe', 'fun', 'combo', 'history'].map(function (tab) { return (<button key={tab} onClick={function () { return setActiveTab(tab); }} style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: activeTab === tab ? "1px solid ".concat(typeColors[tab] || '#888') : '1px solid #333',
                background: activeTab === tab ? (typeColors[tab] || '#666') : 'transparent',
                color: activeTab === tab ? '#fff' : '#888',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: activeTab === tab ? 'bold' : 'normal'
            }}>
            {typeLabels[tab] || '📜 Historique'}
          </button>); })}
      </div>

      {/* Description du type */}
      <div style={{
            background: '#1a1a1a',
            padding: '8px 12px',
            borderRadius: '6px',
            marginBottom: '12px',
            fontSize: '10px',
            color: '#888'
        }}>
        {typeDescriptions[activeTab] || 'Historique complet des prédictions avec résultats'}
      </div>

      {/* Loading */}
      {loading ? (<div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
          <span style={{ fontSize: '12px' }}>Analyse ML en cours...</span>
        </div>) : activeTab === 'history' ? (
        // Historique
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {history.length === 0 ? (<div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>📜</div>
              <span style={{ fontSize: '12px' }}>Aucun historique disponible</span>
            </div>) : (history.map(function (pred, idx) { return (<div key={pred.id} style={{
                    background: 'linear-gradient(135deg, #1a1a2a 0%, #0a0a0a 100%)',
                    borderRadius: '10px',
                    padding: '12px',
                    border: "1px solid ".concat(pred.result === 'won' ? '#22c55e30' : pred.result === 'lost' ? '#ef444430' : '#333')
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                    background: typeColors[pred.type],
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold'
                }}>
                      {typeLabels[pred.type]}
                    </span>
                    <span style={{ fontSize: '11px', color: '#888' }}>
                      Cote: {pred.combinedOdds.toFixed(2)}
                    </span>
                  </div>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    background: pred.result === 'won' ? '#22c55e' : pred.result === 'lost' ? '#ef4444' : '#666',
                    color: '#fff'
                }}>
                    {pred.result === 'won' ? '✅ GAGNÉ' : pred.result === 'lost' ? '❌ PERDU' : '⏳ En attente'}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: '#888' }}>
                  {pred.picks.map(function (p) { return "".concat(p.homeTeam, " vs ").concat(p.awayTeam); }).join(' + ')}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '10px' }}>
                  <span>Mise: {pred.totalStake}€</span>
                  <span style={{ color: pred.result === 'won' ? '#22c55e' : pred.result === 'lost' ? '#ef4444' : '#888' }}>
                    {pred.result === 'won' ? "+".concat(pred.potentialWin - pred.totalStake, "\u20AC") :
                    pred.result === 'lost' ? "-".concat(pred.totalStake, "\u20AC") :
                        "Potentiel: +".concat(pred.potentialWin, "\u20AC")}
                  </span>
                </div>
                {pred.result === 'pending' && (<div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button onClick={function () { return updateResult(pred.id, 'won'); }} style={{
                        flex: 1,
                        padding: '6px',
                        borderRadius: '4px',
                        border: '1px solid #22c55e',
                        background: 'transparent',
                        color: '#22c55e',
                        cursor: 'pointer',
                        fontSize: '10px'
                    }}>
                      ✅ Gagné
                    </button>
                    <button onClick={function () { return updateResult(pred.id, 'lost'); }} style={{
                        flex: 1,
                        padding: '6px',
                        borderRadius: '4px',
                        border: '1px solid #ef4444',
                        background: 'transparent',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '10px'
                    }}>
                      ❌ Perdu
                    </button>
                  </div>)}
              </div>); }))}
        </div>) : (
        // Prédictions actives
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredPredictions.length === 0 ? (<div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔍</div>
              <span style={{ fontSize: '12px' }}>Aucune prédiction {activeTab} disponible</span>
              <p style={{ fontSize: '10px', color: '#555', marginTop: '8px' }}>
                Les prédictions sont générées automatiquement selon les critères ML
              </p>
            </div>) : (filteredPredictions.map(function (pred, idx) {
                var _a;
                return (<div key={pred.id} style={{
                        background: 'linear-gradient(135deg, #1a1a2a 0%, #0a0a0a 100%)',
                        borderRadius: '12px',
                        padding: '14px',
                        border: "1px solid ".concat(typeColors[pred.type], "30"),
                        boxShadow: "0 4px 20px ".concat(typeColors[pred.type], "15")
                    }}>
                {/* Header */}
                <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '12px'
                    }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                        background: typeColors[pred.type],
                        color: '#fff',
                        width: '26px',
                        height: '26px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 'bold'
                    }}>{idx + 1}</span>
                    <span style={{
                        background: "".concat(typeColors[pred.type], "20"),
                        color: typeColors[pred.type],
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 'bold'
                    }}>
                      {typeLabels[pred.type]}
                    </span>
                    <span style={{
                        background: pred.riskLevel === 'low' ? '#22c55e15' : pred.riskLevel === 'medium' ? '#eab30815' : '#ef444415',
                        color: pred.riskLevel === 'low' ? '#22c55e' : pred.riskLevel === 'medium' ? '#eab308' : '#ef4444',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '9px'
                    }}>
                      Risque {pred.riskLevel === 'low' ? 'Faible' : pred.riskLevel === 'medium' ? 'Moyen' : 'Élevé'}
                    </span>
                  </div>
                </div>

                {/* Picks */}
                <div style={{ marginBottom: '12px' }}>
                  {pred.picks.map(function (pick, pIdx) { return (<div key={pick.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            background: '#111',
                            borderRadius: '6px',
                            marginBottom: '6px'
                        }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '11px', color: '#fff', fontWeight: 'bold' }}>
                          {pick.betLabel}
                        </div>
                        <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
                          {pick.homeTeam} vs {pick.awayTeam}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                          <span style={{
                            background: pick.sport === 'football' ? '#22c55e15' :
                                pick.sport === 'basketball' ? '#f9731615' : '#8b5cf615',
                            color: pick.sport === 'football' ? '#22c55e' :
                                pick.sport === 'basketball' ? '#f97316' : '#8b5cf6',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            fontSize: '8px'
                        }}>
                            {pick.sport.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '8px', color: '#888' }}>
                            {pick.league}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#f97316' }}>
                          {pick.odds.toFixed(2)}
                        </div>
                        <div style={{ fontSize: '9px', color: '#888' }}>
                          {pick.winProbability}% prob.
                        </div>
                        <div style={{ fontSize: '8px', color: pick.value >= 0 ? '#22c55e' : '#ef4444' }}>
                          VE: {pick.value >= 0 ? '+' : ''}{pick.value.toFixed(1)}%
                        </div>
                      </div>
                    </div>); })}
                </div>

                {/* Betting summary */}
                <div style={{
                        background: '#0a0a0a',
                        borderRadius: '8px',
                        padding: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#888' }}>Mise suggérée</div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>{pred.totalStake}€</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#888' }}>Cote combinée</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f97316' }}>{pred.combinedOdds.toFixed(2)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: '#888' }}>Gain potentiel</div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#22c55e' }}>+{pred.potentialWin.toFixed(0)}€</div>
                  </div>
                </div>

                {/* Reasoning */}
                {((_a = pred.picks[0]) === null || _a === void 0 ? void 0 : _a.reasoning) && pred.picks[0].reasoning.length > 0 && (<div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>💡 Facteurs clés</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {pred.picks.flatMap(function (p) { return p.reasoning; }).slice(0, 4).map(function (reason, i) { return (<span key={i} style={{
                                background: '#1a1a1a',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '9px',
                                color: '#888'
                            }}>{reason}</span>); })}
                    </div>
                  </div>)}
              </div>);
            }))}
        </div>)}
    </div>);
}
function AdminPanel() {
    var _this = this;
    var _a, _b, _c, _d, _e;
    var _f = (0, react_1.useState)([]), users = _f[0], setUsers = _f[1];
    var _g = (0, react_1.useState)({ total: 0, active: 0, expired: 0, admin: 0, demo: 0, regular: 0 }), stats = _g[0], setStats = _g[1];
    var _h = (0, react_1.useState)([]), logs = _h[0], setLogs = _h[1];
    var _j = (0, react_1.useState)(true), loading = _j[0], setLoading = _j[1];
    var _k = (0, react_1.useState)(''), message = _k[0], setMessage = _k[1];
    var _l = (0, react_1.useState)(false), showAddForm = _l[0], setShowAddForm = _l[1];
    var _m = (0, react_1.useState)(false), showLogs = _m[0], setShowLogs = _m[1];
    var _o = (0, react_1.useState)(null), editingUser = _o[0], setEditingUser = _o[1];
    var _p = (0, react_1.useState)({ login: '', password: '', role: 'user' }), newUser = _p[0], setNewUser = _p[1];
    var _q = (0, react_1.useState)(null), apiStatus = _q[0], setApiStatus = _q[1];
    var _r = (0, react_1.useState)(false), refreshingApi = _r[0], setRefreshingApi = _r[1];
    var _s = (0, react_1.useState)([]), europaMatches = _s[0], setEuropaMatches = _s[1];
    var _t = (0, react_1.useState)(false), loadingEuropa = _t[0], setLoadingEuropa = _t[1];
    // Charger le statut API
    var loadApiStatus = function () { return __awaiter(_this, void 0, void 0, function () {
        var res, data, e_8;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fetch('/api/real-odds')];
                case 1:
                    res = _a.sent();
                    return [4 /*yield*/, res.json()];
                case 2:
                    data = _a.sent();
                    setApiStatus(data);
                    return [3 /*break*/, 4];
                case 3:
                    e_8 = _a.sent();
                    console.error('Erreur chargement statut API:', e_8);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); };
    // Rafraîchir les cotes
    var refreshOdds = function () { return __awaiter(_this, void 0, void 0, function () {
        var res, data, e_9;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    setRefreshingApi(true);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, 5, 6]);
                    return [4 /*yield*/, fetch('/api/real-odds', { method: 'POST' })];
                case 2:
                    res = _b.sent();
                    return [4 /*yield*/, res.json()];
                case 3:
                    data = _b.sent();
                    setApiStatus(data);
                    setMessage("\u2705 ".concat(((_a = data.matches) === null || _a === void 0 ? void 0 : _a.length) || 0, " matchs mis \u00E0 jour"));
                    setTimeout(function () { return setMessage(''); }, 3000);
                    return [3 /*break*/, 6];
                case 4:
                    e_9 = _b.sent();
                    setMessage('❌ Erreur lors de la mise à jour');
                    return [3 /*break*/, 6];
                case 5:
                    setRefreshingApi(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); };
    // Mettre à jour les matchs européens (ESPN - Gratuit)
    var refreshEuropaMatches = function () { return __awaiter(_this, void 0, void 0, function () {
        var res, data, sourceMsg, e_10;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    setLoadingEuropa(true);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, 5, 6]);
                    return [4 /*yield*/, fetch('/api/europa-update')];
                case 2:
                    res = _b.sent();
                    return [4 /*yield*/, res.json()];
                case 3:
                    data = _b.sent();
                    if (data.success) {
                        setEuropaMatches(data.matches);
                        sourceMsg = ((_a = data.stats) === null || _a === void 0 ? void 0 : _a.source) ? " (".concat(data.stats.source, ")") : '';
                        setMessage("\u2705 ".concat(data.matches.length, " matchs europ\u00E9ens").concat(sourceMsg));
                        setTimeout(function () { return setMessage(''); }, 5000);
                    }
                    else {
                        setMessage('❌ Erreur lors de la récupération');
                    }
                    return [3 /*break*/, 6];
                case 4:
                    e_10 = _b.sent();
                    setMessage('❌ Erreur de connexion');
                    return [3 /*break*/, 6];
                case 5:
                    setLoadingEuropa(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); };
    // Charger le statut API au montage
    (0, react_1.useEffect)(function () {
        loadApiStatus();
    }, []);
    // Charger les utilisateurs et logs
    var loadUsers = function () { return __awaiter(_this, void 0, void 0, function () {
        var res, data, e_11;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, 5, 6]);
                    return [4 /*yield*/, fetch('/api/admin/users')];
                case 1:
                    res = _a.sent();
                    if (!res.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, res.json()];
                case 2:
                    data = _a.sent();
                    setUsers(data.users);
                    setStats(data.stats);
                    setLogs(data.logs || []);
                    _a.label = 3;
                case 3: return [3 /*break*/, 6];
                case 4:
                    e_11 = _a.sent();
                    console.error('Erreur chargement utilisateurs:', e_11);
                    return [3 /*break*/, 6];
                case 5:
                    setLoading(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); };
    (0, react_1.useEffect)(function () {
        loadUsers();
    }, []);
    // Action sur un utilisateur
    var handleAction = function (action, login, data) { return __awaiter(_this, void 0, void 0, function () {
        var res, result, e_12;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fetch('/api/admin/users', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: action, login: login, data: data })
                        })];
                case 1:
                    res = _a.sent();
                    return [4 /*yield*/, res.json()];
                case 2:
                    result = _a.sent();
                    if (result.success) {
                        setMessage("\u2705 ".concat(result.message));
                        loadUsers();
                        setTimeout(function () { return setMessage(''); }, 3000);
                    }
                    else {
                        setMessage("\u274C ".concat(result.error));
                    }
                    return [3 /*break*/, 4];
                case 3:
                    e_12 = _a.sent();
                    setMessage('❌ Erreur serveur');
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); };
    // Ajouter un utilisateur
    var handleAddUser = function (e) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    e.preventDefault();
                    return [4 /*yield*/, handleAction('add', '', newUser)];
                case 1:
                    _a.sent();
                    setShowAddForm(false);
                    setNewUser({ login: '', password: '', role: 'user' });
                    return [2 /*return*/];
            }
        });
    }); };
    // Modifier un utilisateur
    var handleUpdateUser = function (e) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    e.preventDefault();
                    if (!editingUser)
                        return [2 /*return*/];
                    return [4 /*yield*/, handleAction('update', editingUser.login, { password: newUser.password || undefined, role: newUser.role })];
                case 1:
                    _a.sent();
                    setEditingUser(null);
                    setNewUser({ login: '', password: '', role: 'user' });
                    return [2 /*return*/];
            }
        });
    }); };
    // Formater la date
    var formatDate = function (dateStr) {
        if (!dateStr)
            return 'Jamais';
        return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    // Calculer les jours restants
    var getDaysRemaining = function (expiresAt) {
        if (!expiresAt)
            return null;
        var diff = new Date(expiresAt).getTime() - Date.now();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };
    if (loading) {
        return <div style={{ color: '#888', padding: '20px', textAlign: 'center' }}>Chargement...</div>;
    }
    return (<div style={{ background: '#111', borderRadius: '12px', padding: '16px', border: '1px solid #eab30830' }}>
      {/* Message de notification */}
      {message && (<div style={{
                background: message.startsWith('✅') ? '#22c55e20' : '#ef444420',
                border: "1px solid ".concat(message.startsWith('✅') ? '#22c55e40' : '#ef444440'),
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '16px',
                color: message.startsWith('✅') ? '#22c55e' : '#ef4444',
                fontSize: '12px'
            }}>
          {message}
        </div>)}

      {/* Section API Status - The Odds API */}
      <div style={{
            background: 'linear-gradient(135deg, #0d1f0d 0%, #1a1a1a 100%)',
            borderRadius: '10px',
            padding: '14px',
            marginBottom: '16px',
            border: '1px solid #22c55e30'
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>📡</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', color: '#22c55e', fontWeight: 'bold' }}>The Odds API</h3>
              <span style={{ fontSize: '10px', color: '#888' }}>Cotes réelles des bookmakers</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={loadApiStatus} disabled={refreshingApi} style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #333',
            background: '#1a1a1a',
            color: '#888',
            cursor: refreshingApi ? 'wait' : 'pointer',
            fontSize: '11px'
        }}>
              {refreshingApi ? '⏳' : '🔄'} Rafraîchir
            </button>
          </div>
        </div>

        {/* Statut et Quota */}
        {apiStatus && (<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            <div style={{ background: '#0a0a0a', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: apiStatus.success ? '#22c55e' : '#ef4444' }}>
                {apiStatus.success ? '✅' : '❌'}
              </div>
              <div style={{ fontSize: '9px', color: '#888' }}>Statut</div>
            </div>
            <div style={{ background: '#0a0a0a', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#22c55e' }}>
                {((_a = apiStatus.quotaInfo) === null || _a === void 0 ? void 0 : _a.remaining) || 0}
              </div>
              <div style={{ fontSize: '9px', color: '#888' }}>Quota Restant</div>
            </div>
            <div style={{ background: '#0a0a0a', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f97316' }}>
                {((_b = apiStatus.quotaInfo) === null || _b === void 0 ? void 0 : _b.dailyUsed) || 0}/{((_c = apiStatus.quotaInfo) === null || _c === void 0 ? void 0 : _c.dailyBudget) || 15}
              </div>
              <div style={{ fontSize: '9px', color: '#888' }}>Req Aujourd'hui</div>
            </div>
            <div style={{ background: '#0a0a0a', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#3b82f6' }}>
                {((_d = apiStatus.stats) === null || _d === void 0 ? void 0 : _d.active) || ((_e = apiStatus.matches) === null || _e === void 0 ? void 0 : _e.length) || 0}
              </div>
              <div style={{ fontSize: '9px', color: '#888' }}>Matchs</div>
            </div>
          </div>)}

        {/* Source info */}
        {apiStatus && (<div style={{ marginTop: '10px', padding: '8px', background: '#0a0a0a', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
            <span style={{ color: '#888' }}>Source: <span style={{ color: apiStatus.source === 'api' ? '#22c55e' : '#f97316' }}>{apiStatus.source || 'unknown'}</span></span>
            <span style={{ color: '#888' }}>{apiStatus.message}</span>
          </div>)}
      </div>

      {/* Section Europa League & Conference League */}
      <div style={{
            background: 'linear-gradient(135deg, #1a0d1f 0%, #1a1a1a 100%)',
            borderRadius: '10px',
            padding: '14px',
            marginBottom: '16px',
            border: '1px solid #a855f730'
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🏆</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', color: '#a855f7', fontWeight: 'bold' }}>Compétitions Européennes</h3>
              <span style={{ fontSize: '10px', color: '#888' }}>Europa League • Conference League • Champions League</span>
            </div>
          </div>
          <button onClick={refreshEuropaMatches} disabled={loadingEuropa} style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: '1px solid #a855f7',
            background: loadingEuropa ? '#333' : '#a855f7',
            color: '#fff',
            cursor: loadingEuropa ? 'wait' : 'pointer',
            fontSize: '11px',
            fontWeight: 'bold'
        }}>
            {loadingEuropa ? '⏳ Chargement...' : '🔄 Charger Matchs CE'}
          </button>
        </div>

        {/* Matchs européens */}
        {europaMatches.length > 0 && (<div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
            {europaMatches.slice(0, 10).map(function (match, i) {
                var _a, _b, _c, _d, _e, _f;
                return (<div key={match.id || i} style={{
                        background: '#0a0a0a',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '10px'
                    }}>
                <div>
                  <span style={{ color: '#a855f7', fontWeight: 'bold' }}>[{match.league}]</span>{' '}
                  <span style={{ color: '#fff' }}>{match.homeTeam} vs {match.awayTeam}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ color: '#22c55e' }}>{(_a = match.oddsHome) === null || _a === void 0 ? void 0 : _a.toFixed(2)}</span>
                  <span style={{ color: '#888' }}>{((_b = match.oddsDraw) === null || _b === void 0 ? void 0 : _b.toFixed(2)) || '-'}</span>
                  <span style={{ color: '#ef4444' }}>{(_c = match.oddsAway) === null || _c === void 0 ? void 0 : _c.toFixed(2)}</span>
                  {(((_d = match.predictions) === null || _d === void 0 ? void 0 : _d.confidence) === 'high' || ((_e = match.insight) === null || _e === void 0 ? void 0 : _e.confidence) === 'high' || ((_f = match.insight) === null || _f === void 0 ? void 0 : _f.confidence) === 'very_high') && (<span title="Probabilité de succès ≥ 70% - Recommandé pour les paris sûrs" style={{ background: '#22c55e', color: '#000', padding: '2px 4px', borderRadius: '3px', fontSize: '8px', fontWeight: 'bold', cursor: 'help' }}>
                      HAUTE CONFIANCE
                    </span>)}
                </div>
              </div>);
            })}
            {europaMatches.length > 10 && (<div style={{ textAlign: 'center', color: '#666', fontSize: '10px', padding: '4px' }}>
                +{europaMatches.length - 10} autres matchs
              </div>)}
          </div>)}

        {europaMatches.length === 0 && !loadingEuropa && (<div style={{ textAlign: 'center', color: '#666', fontSize: '11px', padding: '20px' }}>
            Cliquez sur "Charger Matchs CE" pour récupérer les matchs européens
          </div>)}
      </div>

      {/* Statistiques Utilisateurs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px', marginBottom: '16px' }}>
        <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#eab308' }}>{stats.total}</div>
          <div style={{ fontSize: '10px', color: '#888' }}>Total</div>
        </div>
        <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#22c55e' }}>{stats.active}</div>
          <div style={{ fontSize: '10px', color: '#888' }}>Actifs</div>
        </div>
        <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444' }}>{stats.expired}</div>
          <div style={{ fontSize: '10px', color: '#888' }}>Expirés</div>
        </div>
        <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#8b5cf6' }}>{stats.regular}</div>
          <div style={{ fontSize: '10px', color: '#888' }}>Utilisateurs</div>
        </div>
      </div>

      {/* Boutons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={function () { return setShowAddForm(true); }} style={{
            flex: 1,
            padding: '10px',
            background: '#eab308',
            color: '#000',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            cursor: 'pointer'
        }}>
          ➕ Ajouter
        </button>
        <button onClick={function () { return setShowLogs(!showLogs); }} style={{
            flex: 1,
            padding: '10px',
            background: showLogs ? '#8b5cf6' : '#333',
            color: showLogs ? '#fff' : '#888',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            cursor: 'pointer'
        }}>
          📋 Logs ({logs.length})
        </button>
      </div>

      {/* Section Logs */}
      {showLogs && (<div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#8b5cf6' }}>📋 Dernières activités</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
            {logs.length === 0 ? (<div style={{ color: '#666', fontSize: '12px', textAlign: 'center', padding: '10px' }}>Aucune activité</div>) : (logs.map(function (log) { return (<div key={log.id} style={{ display: 'flex', gap: '8px', fontSize: '10px', padding: '6px', background: '#0a0a0a', borderRadius: '4px' }}>
                  <span style={{ color: '#666', minWidth: '80px' }}>{new Date(log.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ color: log.action === 'LOGIN' ? '#22c55e' : log.action === 'DELETE' ? '#ef4444' : log.action === 'CREATE' ? '#3b82f6' : '#eab308', fontWeight: 'bold', minWidth: '70px' }}>{log.action}</span>
                  <span style={{ color: '#fff' }}>{log.target}</span>
                  <span style={{ color: '#888', flex: 1 }}>{log.details}</span>
                </div>); }))}
          </div>
        </div>)}

      {/* Formulaire d'ajout */}
      {showAddForm && (<form onSubmit={handleAddUser} style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#eab308' }}>Nouvel utilisateur</h4>
          <div style={{ display: 'grid', gap: '8px' }}>
            <input type="text" placeholder="Login" value={newUser.login} onChange={function (e) { return setNewUser(__assign(__assign({}, newUser), { login: e.target.value })); }} required style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #333', background: '#0a0a0a', color: '#fff' }}/>
            <input type="text" placeholder="Mot de passe" value={newUser.password} onChange={function (e) { return setNewUser(__assign(__assign({}, newUser), { password: e.target.value })); }} required style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #333', background: '#0a0a0a', color: '#fff' }}/>
            <select value={newUser.role} onChange={function (e) { return setNewUser(__assign(__assign({}, newUser), { role: e.target.value })); }} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #333', background: '#0a0a0a', color: '#fff' }}>
              <option value="user">Utilisateur</option>
              <option value="demo">Demo</option>
              <option value="admin">Admin</option>
            </select>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" style={{ flex: 1, padding: '8px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                Créer
              </button>
              <button type="button" onClick={function () { return setShowAddForm(false); }} style={{ flex: 1, padding: '8px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                Annuler
              </button>
            </div>
          </div>
        </form>)}

      {/* Formulaire de modification */}
      {editingUser && (<form onSubmit={handleUpdateUser} style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#eab308' }}>Modifier {editingUser.login}</h4>
          <div style={{ display: 'grid', gap: '8px' }}>
            <input type="text" placeholder="Nouveau mot de passe (vide = inchangé)" value={newUser.password} onChange={function (e) { return setNewUser(__assign(__assign({}, newUser), { password: e.target.value })); }} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #333', background: '#0a0a0a', color: '#fff' }}/>
            <select value={newUser.role} onChange={function (e) { return setNewUser(__assign(__assign({}, newUser), { role: e.target.value })); }} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #333', background: '#0a0a0a', color: '#fff' }}>
              <option value="user">Utilisateur</option>
              <option value="demo">Demo</option>
              <option value="admin">Admin</option>
            </select>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" style={{ flex: 1, padding: '8px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                Modifier
              </button>
              <button type="button" onClick={function () { setEditingUser(null); setNewUser({ login: '', password: '', role: 'user' }); }} style={{ flex: 1, padding: '8px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                Annuler
              </button>
            </div>
          </div>
        </form>)}

      {/* Liste des utilisateurs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {users.map(function (user) {
            var daysRemaining = getDaysRemaining(user.expiresAt);
            var isExpired = daysRemaining !== null && daysRemaining <= 0;
            return (<div key={user.login} style={{
                    background: '#1a1a1a',
                    borderRadius: '8px',
                    padding: '12px',
                    border: "1px solid ".concat(!user.isActive || isExpired ? '#ef444430' : '#333'),
                    opacity: !user.isActive || isExpired ? 0.7 : 1
                }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 'bold', color: '#fff' }}>{user.login}</span>
                    <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    fontWeight: 'bold',
                    background: user.role === 'admin' ? '#ef4444' : user.role === 'demo' ? '#8b5cf6' : '#3b82f6',
                    color: '#fff'
                }}>
                      {user.role.toUpperCase()}
                    </span>
                    {!user.isActive && (<span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', background: '#ef4444', color: '#fff' }}>DÉSACTIVÉ</span>)}
                    {isExpired && (<span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', background: '#f97316', color: '#fff' }}>EXPIRÉ</span>)}
                  </div>
                  <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                    Dernière connexion: {formatDate(user.lastLoginAt)}
                  </div>
                </div>
                
                {user.role !== 'admin' && (<div style={{ textAlign: 'right' }}>
                    {user.expiresAt && (<div style={{
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: daysRemaining && daysRemaining <= 7 ? '#ef4444' : daysRemaining && daysRemaining <= 30 ? '#f97316' : '#22c55e'
                        }}>
                        {daysRemaining} jours restants
                      </div>)}
                    <div style={{ fontSize: '9px', color: '#666' }}>
                      Expire: {formatDate(user.expiresAt)}
                    </div>
                  </div>)}
              </div>

              {/* Actions */}
              {user.role !== 'admin' && (<div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
                  {/* Prolonger */}
                  <button onClick={function () { return handleAction('extend', user.login, { months: 1 }); }} style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        background: '#22c55e',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}>
                    +1 mois
                  </button>
                  <button onClick={function () { return handleAction('extend', user.login, { months: 3 }); }} style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        background: '#22c55e',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}>
                    +3 mois
                  </button>

                  {/* Activer/Désactiver */}
                  {user.isActive ? (<button onClick={function () { return handleAction('deactivate', user.login); }} style={{
                            padding: '4px 8px',
                            fontSize: '10px',
                            background: '#f97316',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}>
                      Désactiver
                    </button>) : (<button onClick={function () { return handleAction('reactivate', user.login); }} style={{
                            padding: '4px 8px',
                            fontSize: '10px',
                            background: '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}>
                      Réactiver
                    </button>)}

                  {/* Modifier */}
                  <button onClick={function () {
                        setEditingUser(user);
                        setNewUser({ login: user.login, password: '', role: user.role });
                    }} style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        background: '#8b5cf6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}>
                    Modifier
                  </button>

                  {/* Supprimer */}
                  <button onClick={function () {
                        if (confirm("Supprimer ".concat(user.login, " ?"))) {
                            handleAction('delete', user.login);
                        }
                    }} style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}>
                    Supprimer
                  </button>
                </div>)}
            </div>);
        })}
      </div>
    </div>);
}
// Section Analyse de Match
function MatchAnalysisSection(_a) {
    var _this = this;
    var _b, _c, _d, _e, _f, _g;
    var username = _a.username, matches = _a.matches;
    var _h = (0, react_1.useState)(''), homeTeam = _h[0], setHomeTeam = _h[1];
    var _j = (0, react_1.useState)(''), awayTeam = _j[0], setAwayTeam = _j[1];
    var _k = (0, react_1.useState)(false), analyzing = _k[0], setAnalyzing = _k[1];
    var _l = (0, react_1.useState)(null), result = _l[0], setResult = _l[1];
    var _m = (0, react_1.useState)(''), error = _m[0], setError = _m[1];
    var _o = (0, react_1.useState)(3), remainingAnalyses = _o[0], setRemainingAnalyses = _o[1];
    var _p = (0, react_1.useState)({ home: [], away: [] }), suggestions = _p[0], setSuggestions = _p[1];
    var _q = (0, react_1.useState)(null), enrichment = _q[0], setEnrichment = _q[1];
    var _r = (0, react_1.useState)(false), loadingEnrichment = _r[0], setLoadingEnrichment = _r[1];
    // Charger le nombre d'analyses restantes
    (0, react_1.useEffect)(function () {
        if (username) {
            fetch("/api/combi-analysis?username=".concat(username))
                .then(function (res) { return res.json(); })
                .then(function (data) {
                if (data.success) {
                    setRemainingAnalyses(data.remainingAnalyses);
                }
            })
                .catch(function () { });
        }
    }, [username]);
    // Fuzzy matching - calcul de similarité
    var calculateSimilarity = function (str1, str2) {
        var s1 = str1.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        var s2 = str2.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        if (s1 === s2)
            return 100;
        if (s1.includes(s2) || s2.includes(s1))
            return 85;
        // Distance de Levenshtein simplifiée
        var matrix = [];
        for (var i = 0; i <= s1.length; i++) {
            matrix[i] = [i];
        }
        for (var j = 0; j <= s2.length; j++) {
            matrix[0][j] = j;
        }
        for (var i = 1; i <= s1.length; i++) {
            for (var j = 1; j <= s2.length; j++) {
                var cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
            }
        }
        var maxLen = Math.max(s1.length, s2.length);
        return Math.round((1 - matrix[s1.length][s2.length] / maxLen) * 100);
    };
    // Trouver le meilleur match avec fuzzy matching
    var findBestMatch = function (homeInput, awayInput) {
        var _a;
        var bestMatch = null;
        var bestSimilarity = 0;
        var isToday = false;
        var matchDate = null;
        var today = new Date().toISOString().split('T')[0];
        for (var _i = 0, matches_1 = matches; _i < matches_1.length; _i++) {
            var m = matches_1[_i];
            var homeSim = calculateSimilarity(homeInput, m.homeTeam);
            var awaySim = calculateSimilarity(awayInput, m.awayTeam);
            var totalSim = (homeSim + awaySim) / 2;
            // Vérifier aussi l'inverse (domicile/extérieur inversés)
            var homeSimInv = calculateSimilarity(homeInput, m.awayTeam);
            var awaySimInv = calculateSimilarity(awayInput, m.homeTeam);
            var totalSimInv = (homeSimInv + awaySimInv) / 2;
            var finalSim = Math.max(totalSim, totalSimInv);
            if (finalSim > bestSimilarity && finalSim >= 50) {
                bestSimilarity = finalSim;
                bestMatch = m;
                isToday = ((_a = m.date) === null || _a === void 0 ? void 0 : _a.startsWith(today)) || false;
                matchDate = m.date;
            }
        }
        return { match: bestMatch, similarity: bestSimilarity, isToday: isToday, matchDate: matchDate };
    };
    // Générer les suggestions d'équipes
    var generateSuggestions = function (input, type) {
        if (input.length < 2) {
            setSuggestions(function (prev) {
                var _a;
                return (__assign(__assign({}, prev), (_a = {}, _a[type] = [], _a)));
            });
            return;
        }
        var allTeams = new Set();
        matches.forEach(function (m) {
            allTeams.add(m.homeTeam);
            allTeams.add(m.awayTeam);
        });
        var matched = Array.from(allTeams).filter(function (team) {
            var sim = calculateSimilarity(input, team);
            return sim >= 40;
        }).slice(0, 5);
        setSuggestions(function (prev) {
            var _a;
            return (__assign(__assign({}, prev), (_a = {}, _a[type] = matched, _a)));
        });
    };
    // Analyser le match
    var analyzeMatch = function () { return __awaiter(_this, void 0, void 0, function () {
        var _a, match, similarity, isToday, matchDate, response, expertData, analysisResult_1, expertError_1, homeProb, awayProb, drawProb, favorite, favoriteTeam, favoriteProb, favoriteOdds, recommendation, betType, analysisResult, response, apiResult, e_13, err_3;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
        return __generator(this, function (_z) {
            switch (_z.label) {
                case 0:
                    if (!username) {
                        setError('Utilisateur non connecté');
                        return [2 /*return*/];
                    }
                    if (!homeTeam || !awayTeam) {
                        setError('Veuillez saisir les deux équipes');
                        return [2 /*return*/];
                    }
                    if (remainingAnalyses <= 0) {
                        setError('Limite quotidienne atteinte (3 analyses/jour)');
                        return [2 /*return*/];
                    }
                    setAnalyzing(true);
                    setError('');
                    setResult(null);
                    _z.label = 1;
                case 1:
                    _z.trys.push([1, 15, 16, 17]);
                    _a = findBestMatch(homeTeam, awayTeam), match = _a.match, similarity = _a.similarity, isToday = _a.isToday, matchDate = _a.matchDate;
                    if (!(!match || similarity < 50)) return [3 /*break*/, 8];
                    // Analyse via API Expert pour match personnalisé
                    setError("\uD83D\uDD0D Match non dans la liste du jour - Analyse ML en cours...");
                    _z.label = 2;
                case 2:
                    _z.trys.push([2, 6, , 7]);
                    return [4 /*yield*/, fetch('/api/expert-advice', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                homeTeam: homeTeam.trim(),
                                awayTeam: awayTeam.trim(),
                                sport: 'Foot', // Par défaut
                                league: 'Personnalisé'
                            })
                        })];
                case 3:
                    response = _z.sent();
                    if (!response.ok) return [3 /*break*/, 5];
                    return [4 /*yield*/, response.json()];
                case 4:
                    expertData = _z.sent();
                    if (expertData && expertData.recommendation) {
                        analysisResult_1 = {
                            match: {
                                id: "custom-".concat(Date.now()),
                                homeTeam: homeTeam.trim(),
                                awayTeam: awayTeam.trim(),
                                sport: expertData.sport || 'Foot',
                                league: expertData.league || 'Personnalisé',
                                oddsHome: ((_b = expertData.oddsAnalysis) === null || _b === void 0 ? void 0 : _b.favoriteOdds) || 2.0,
                                oddsDraw: null,
                                oddsAway: ((_c = expertData.oddsAnalysis) === null || _c === void 0 ? void 0 : _c.favoriteOdds) || 2.0,
                                insight: {
                                    riskPercentage: 100 - (((_d = expertData.recommendation) === null || _d === void 0 ? void 0 : _d.expectedValue) || 0),
                                    confidence: ((_e = expertData.recommendation) === null || _e === void 0 ? void 0 : _e.confidence) || 'medium',
                                    valueBetDetected: ((_f = expertData.oddsAnalysis) === null || _f === void 0 ? void 0 : _f.isValueBet) || false,
                                    valueBetType: null
                                }
                            },
                            similarity: 0,
                            isToday: false,
                            matchDate: null,
                            isCustomAnalysis: true,
                            probability: {
                                home: ((_g = expertData.oddsAnalysis) === null || _g === void 0 ? void 0 : _g.impliedProbability) || 33,
                                draw: 28,
                                away: 100 - (((_h = expertData.oddsAnalysis) === null || _h === void 0 ? void 0 : _h.impliedProbability) || 33) - 28
                            },
                            favorite: {
                                team: ((_j = expertData.oddsAnalysis) === null || _j === void 0 ? void 0 : _j.favorite) || homeTeam,
                                probability: ((_k = expertData.oddsAnalysis) === null || _k === void 0 ? void 0 : _k.estimatedProbability) || 40,
                                odds: ((_l = expertData.oddsAnalysis) === null || _l === void 0 ? void 0 : _l.favoriteOdds) || 2.0
                            },
                            recommendation: ((_m = expertData.recommendation) === null || _m === void 0 ? void 0 : _m.bet) === 'avoid'
                                ? 'ÉVITER CE MATCH'
                                : "EXPERT: ".concat(((_o = expertData.recommendation) === null || _o === void 0 ? void 0 : _o.bet) === 'home' ? "VICTOIRE ".concat(homeTeam) :
                                    ((_p = expertData.recommendation) === null || _p === void 0 ? void 0 : _p.bet) === 'away' ? "VICTOIRE ".concat(awayTeam) : 'NUL'),
                            betType: ((_r = (_q = expertData.recommendation) === null || _q === void 0 ? void 0 : _q.reasoning) === null || _r === void 0 ? void 0 : _r[0]) || 'Analyse ML personnalisée',
                            goals: null,
                            cards: null,
                            corners: null,
                            risk: 100 - (((_s = expertData.recommendation) === null || _s === void 0 ? void 0 : _s.expectedValue) || 0),
                            confidence: ((_t = expertData.recommendation) === null || _t === void 0 ? void 0 : _t.confidence) || 'medium',
                            expertData: expertData
                        };
                        setResult(analysisResult_1);
                        setRemainingAnalyses(function (prev) { return prev - 1; });
                        setError(''); // Clear error on success
                        setAnalyzing(false);
                        return [2 /*return*/];
                    }
                    _z.label = 5;
                case 5: return [3 /*break*/, 7];
                case 6:
                    expertError_1 = _z.sent();
                    console.error('Erreur analyse expert:', expertError_1);
                    return [3 /*break*/, 7];
                case 7:
                    // Si l'API Expert échoue aussi
                    setError('❌ Match non trouvé dans la liste du jour et analyse ML indisponible. Essayez avec des équipes du jour.');
                    setAnalyzing(false);
                    return [2 /*return*/];
                case 8:
                    if (!isToday) {
                        setError("\u26A0\uFE0F Attention: Ce match n'est pas pr\u00E9vu aujourd'hui. Date: ".concat(matchDate ? new Date(matchDate).toLocaleDateString('fr-FR') : 'Non disponible'));
                    }
                    if (similarity < 80) {
                        setError("\u26A0\uFE0F Correspondance approximative (".concat(similarity, "%). Match trouv\u00E9: ").concat(match.homeTeam, " vs ").concat(match.awayTeam));
                    }
                    homeProb = Math.round((1 / match.oddsHome) / ((1 / match.oddsHome) + (1 / match.oddsAway) + (match.oddsDraw ? 1 / match.oddsDraw : 0)) * 100);
                    awayProb = Math.round((1 / match.oddsAway) / ((1 / match.oddsHome) + (1 / match.oddsAway) + (match.oddsDraw ? 1 / match.oddsDraw : 0)) * 100);
                    drawProb = match.oddsDraw ? Math.round((1 / match.oddsDraw) / ((1 / match.oddsHome) + (1 / match.oddsAway) + (1 / match.oddsDraw)) * 100) : 0;
                    favorite = match.oddsHome < match.oddsAway ? 'home' : 'away';
                    favoriteTeam = favorite === 'home' ? match.homeTeam : match.awayTeam;
                    favoriteProb = favorite === 'home' ? homeProb : awayProb;
                    favoriteOdds = favorite === 'home' ? match.oddsHome : match.oddsAway;
                    recommendation = '';
                    betType = '';
                    if (favoriteOdds < 1.5 && favoriteProb >= 65) {
                        recommendation = "VICTOIRE ".concat(favoriteTeam.toUpperCase());
                        betType = '1N2 - Victoire simple';
                    }
                    else if (favoriteOdds < 2.0 && favoriteProb >= 50) {
                        recommendation = "VICTOIRE ou NUL - ".concat(favoriteTeam.toUpperCase());
                        betType = 'Double Chance (1X ou X2)';
                    }
                    else if (drawProb >= 30) {
                        recommendation = "RISQUE DE NUL \u00C9LEV\u00C9";
                        betType = 'Considérer le Nul ou Double Chance';
                    }
                    else {
                        recommendation = "MATCH SERR\u00C9 - ANALYSE APPROFONDIE";
                        betType = 'Plusieurs scénarios possibles';
                    }
                    analysisResult = {
                        match: match,
                        similarity: similarity,
                        isToday: isToday,
                        matchDate: matchDate,
                        probability: {
                            home: homeProb,
                            draw: drawProb,
                            away: awayProb
                        },
                        favorite: {
                            team: favoriteTeam,
                            probability: favoriteProb,
                            odds: favoriteOdds
                        },
                        recommendation: recommendation,
                        betType: betType,
                        goals: match.goalsPrediction ? {
                            total: match.goalsPrediction.total,
                            over25: match.goalsPrediction.over25,
                            under25: match.goalsPrediction.under25,
                            prediction: match.goalsPrediction.over25 >= 55 ? 'Over 2.5' : 'Under 2.5'
                        } : null,
                        cards: match.cardsPrediction ? {
                            total: match.cardsPrediction.total,
                            over45: match.cardsPrediction.over45,
                            prediction: match.cardsPrediction.over45 >= 55 ? 'Over 4.5' : 'Under 4.5'
                        } : null,
                        corners: match.cornersPrediction ? {
                            total: match.cornersPrediction.total,
                            over85: match.cornersPrediction.over85,
                            prediction: match.cornersPrediction.over85 >= 55 ? 'Over 8.5' : 'Under 8.5'
                        } : null,
                        risk: (_v = (_u = match.insight) === null || _u === void 0 ? void 0 : _u.riskPercentage) !== null && _v !== void 0 ? _v : 50,
                        confidence: (_x = (_w = match.insight) === null || _w === void 0 ? void 0 : _w.confidence) !== null && _x !== void 0 ? _x : "medium"
                    };
                    setResult(analysisResult);
                    setRemainingAnalyses(function (prev) { return prev - 1; });
                    // Enregistrer l'analyse et récupérer l'enrichissement API-Football
                    setLoadingEnrichment(true);
                    _z.label = 9;
                case 9:
                    _z.trys.push([9, 12, 13, 14]);
                    return [4 /*yield*/, fetch('/api/combi-analysis', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                username: username,
                                matches: [{ homeTeam: match.homeTeam, awayTeam: match.awayTeam, betType: 'analyse' }]
                            })
                        })];
                case 10:
                    response = _z.sent();
                    return [4 /*yield*/, response.json()];
                case 11:
                    apiResult = _z.sent();
                    // Si l'API a retourné des données d'enrichissement
                    if (apiResult.results && ((_y = apiResult.results[0]) === null || _y === void 0 ? void 0 : _y.enrichment)) {
                        setEnrichment(apiResult.results[0].enrichment);
                    }
                    return [3 /*break*/, 14];
                case 12:
                    e_13 = _z.sent();
                    console.log('Enrichissement non disponible');
                    return [3 /*break*/, 14];
                case 13:
                    setLoadingEnrichment(false);
                    return [7 /*endfinally*/];
                case 14: return [3 /*break*/, 17];
                case 15:
                    err_3 = _z.sent();
                    setError(err_3.message || 'Erreur lors de l\'analyse');
                    return [3 /*break*/, 17];
                case 16:
                    setAnalyzing(false);
                    return [7 /*endfinally*/];
                case 17: return [2 /*return*/];
            }
        });
    }); };
    return (<div style={{
            background: '#111',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #3b82f630'
        }}>
      {/* Compteur d'analyses */}
      <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            padding: '10px',
            background: remainingAnalyses <= 0 ? 'rgba(239, 68, 68, 0.1)' : '#1a1a1a',
            borderRadius: '8px',
            border: remainingAnalyses <= 0 ? '1px solid #ef4444' : 'none'
        }}>
        <div>
          <span style={{ color: remainingAnalyses <= 0 ? '#ef4444' : '#888', fontSize: '12px', fontWeight: remainingAnalyses <= 0 ? 'bold' : 'normal' }}>
            {remainingAnalyses <= 0 ? '⚠️ Limite atteinte' : 'Analyses disponibles aujourd\'hui'}
          </span>
          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
            {[1, 2, 3].map(function (i) { return (<div key={i} style={{
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                background: i <= remainingAnalyses ? '#3b82f6' : remainingAnalyses <= 0 ? '#ef444440' : '#333',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                color: i <= remainingAnalyses ? '#fff' : remainingAnalyses <= 0 ? '#ef4444' : '#666'
            }}>{i}</div>); })}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '24px' }}>{remainingAnalyses <= 0 ? '🚫' : '🔍'}</span>
        </div>
      </div>

      {/* Championnats supportés */}
      <div style={{
            marginBottom: '16px',
            padding: '10px',
            background: '#0a0a0a',
            borderRadius: '8px',
            border: '1px solid #222'
        }}>
        <div style={{ color: '#666', fontSize: '11px', marginBottom: '8px' }}>
          📋 Championnats pris en charge:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {['Premier League', 'Ligue 1', 'La Liga', 'Bundesliga', 'Serie A', 'Champions League', 'NBA'].map(function (league, i) { return (<span key={i} style={{
                padding: '3px 8px',
                background: '#1a1a1a',
                borderRadius: '4px',
                fontSize: '10px',
                color: '#888'
            }}>{league}</span>); })}
        </div>
      </div>

      {/* Formulaire de saisie */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px'
        }}>
          <span style={{ color: '#f97316', fontSize: '13px', fontWeight: 'bold' }}>
            ⚽ Saisissez le match à analyser
          </span>
        </div>

        <div style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            padding: '12px',
            background: '#1a1a1a',
            borderRadius: '8px'
        }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input type="text" placeholder="Équipe domicile" value={homeTeam} onChange={function (e) {
            setHomeTeam(e.target.value);
            generateSuggestions(e.target.value, 'home');
        }} style={{
            width: '100%',
            padding: '10px',
            background: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '13px',
            boxSizing: 'border-box'
        }}/>
            {suggestions.home.length > 0 && (<div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '4px',
                zIndex: 10,
                marginTop: '2px'
            }}>
                {suggestions.home.map(function (team, i) { return (<div key={i} onClick={function () {
                    setHomeTeam(team);
                    setSuggestions(function (prev) { return (__assign(__assign({}, prev), { home: [] })); });
                }} style={{
                    padding: '8px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: '#fff',
                    borderBottom: i < suggestions.home.length - 1 ? '1px solid #222' : 'none'
                }}>
                    {team}
                  </div>); })}
              </div>)}
          </div>
          
          <span style={{ color: '#666', fontWeight: 'bold' }}>VS</span>
          
          <div style={{ flex: 1, position: 'relative' }}>
            <input type="text" placeholder="Équipe extérieur" value={awayTeam} onChange={function (e) {
            setAwayTeam(e.target.value);
            generateSuggestions(e.target.value, 'away');
        }} style={{
            width: '100%',
            padding: '10px',
            background: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '13px',
            boxSizing: 'border-box'
        }}/>
            {suggestions.away.length > 0 && (<div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '4px',
                zIndex: 10,
                marginTop: '2px'
            }}>
                {suggestions.away.map(function (team, i) { return (<div key={i} onClick={function () {
                    setAwayTeam(team);
                    setSuggestions(function (prev) { return (__assign(__assign({}, prev), { away: [] })); });
                }} style={{
                    padding: '8px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: '#fff',
                    borderBottom: i < suggestions.away.length - 1 ? '1px solid #222' : 'none'
                }}>
                    {team}
                  </div>); })}
              </div>)}
          </div>
        </div>
        
        <p style={{ color: '#666', fontSize: '10px', marginTop: '8px', textAlign: 'center' }}>
          💡 Tapez les premières lettres pour voir les suggestions
        </p>
      </div>

      {/* Erreur */}
      {error && (<div style={{
                padding: '10px',
                background: '#ef444420',
                border: '1px solid #ef444440',
                borderRadius: '8px',
                color: '#ef4444',
                fontSize: '12px',
                marginBottom: '12px'
            }}>
          {error}
        </div>)}

      {/* Bouton d'analyse */}
      <button onClick={analyzeMatch} disabled={analyzing || remainingAnalyses <= 0} style={{
            width: '100%',
            padding: '14px',
            background: analyzing || remainingAnalyses <= 0 ? '#333' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: analyzing || remainingAnalyses <= 0 ? 'not-allowed' : 'pointer',
            marginBottom: '16px'
        }}>
        {analyzing ? '⏳ Analyse en cours...' : "\uD83D\uDD0D Analyser le match (".concat(remainingAnalyses, " restant").concat(remainingAnalyses > 1 ? 's' : '', ")")}
      </button>

      {/* Résultats */}
      {result && (<div style={{
                marginTop: '16px',
                padding: '16px',
                background: '#0a0a0a',
                borderRadius: '12px',
                border: '1px solid #22c55e30'
            }}>
          {/* En-tête du match */}
          <div style={{
                textAlign: 'center',
                marginBottom: '16px',
                paddingBottom: '12px',
                borderBottom: '1px solid #222'
            }}>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
              {result.match.league} • {result.matchDate ? new Date(result.matchDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>
              {result.match.homeTeam} vs {result.match.awayTeam}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
              <span style={{ padding: '4px 10px', background: result.match.oddsHome < result.match.oddsAway ? '#f97316' : '#1a1a1a', borderRadius: '4px', fontSize: '12px', color: '#fff' }}>
                {formatOdds(result.match.oddsHome)}
              </span>
              {result.match.oddsDraw != null && typeof result.match.oddsDraw === 'number' && (<span style={{ padding: '4px 10px', background: '#1a1a1a', borderRadius: '4px', fontSize: '12px', color: '#888' }}>
                  {formatOdds(result.match.oddsDraw)}
                </span>)}
              <span style={{ padding: '4px 10px', background: result.match.oddsAway < result.match.oddsHome ? '#f97316' : '#1a1a1a', borderRadius: '4px', fontSize: '12px', color: '#fff' }}>
                {formatOdds(result.match.oddsAway)}
              </span>
            </div>
          </div>

          {/* Résumé principal */}
          <div style={{
                background: 'linear-gradient(135deg, #22c55e20 0%, #16a34a20 100%)',
                borderRadius: '8px',
                padding: '14px',
                marginBottom: '12px',
                border: '1px solid #22c55e40'
            }}>
            <div style={{ color: '#22c55e', fontSize: '11px', marginBottom: '4px' }}>
              📊 RÉSUMÉ DE L'ANALYSE
            </div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff', marginBottom: '6px' }}>
              {result.recommendation}
            </div>
            <div style={{ fontSize: '12px', color: '#888' }}>
              Type de pari: <span style={{ color: '#f97316' }}>{result.betType}</span>
            </div>
          </div>

          {/* Grille des stats */}
          <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px',
                marginBottom: '12px'
            }}>
            {/* Probabilités */}
            <div style={{
                padding: '10px',
                background: '#1a1a1a',
                borderRadius: '8px'
            }}>
              <div style={{ color: '#666', fontSize: '10px', marginBottom: '6px' }}>📈 Probabilités</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: result.favorite.team === result.match.homeTeam ? '#f97316' : '#888' }}>🏠 {result.probability.home}%</span>
                <span style={{ color: '#eab308' }}>🤝 {result.probability.draw}%</span>
                <span style={{ color: result.favorite.team === result.match.awayTeam ? '#f97316' : '#888' }}>✈️ {result.probability.away}%</span>
              </div>
            </div>

            {/* Risque */}
            <div style={{
                padding: '10px',
                background: '#1a1a1a',
                borderRadius: '8px'
            }}>
              <div style={{ color: '#666', fontSize: '10px', marginBottom: '6px' }}>⚠️ Niveau de risque</div>
              <div style={{
                fontSize: '14px',
                fontWeight: 'bold',
                color: result.risk <= 40 ? '#22c55e' : result.risk <= 50 ? '#f97316' : '#ef4444'
            }}>
                {result.risk}% - {result.risk <= 40 ? 'Faible' : result.risk <= 50 ? 'Modéré' : 'Élevé'}
              </div>
            </div>
          </div>

          {/* Prédictions détaillées */}
          <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px'
            }}>
            {/* Buts */}
            {result.goals && (<div style={{
                    padding: '10px',
                    background: '#1a1a1a',
                    borderRadius: '8px',
                    textAlign: 'center'
                }}>
                <div style={{ fontSize: '18px', marginBottom: '4px' }}>⚽</div>
                <div style={{ color: '#666', fontSize: '10px' }}>Buts attendus</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{result.goals.total}</div>
                <div style={{ fontSize: '10px', color: result.goals.over25 >= 55 ? '#22c55e' : '#888', marginTop: '4px' }}>
                  {result.goals.prediction} ({Math.max(result.goals.over25, result.goals.under25)}%)
                </div>
              </div>)}

            {/* Corners */}
            {result.corners && (<div style={{
                    padding: '10px',
                    background: '#1a1a1a',
                    borderRadius: '8px',
                    textAlign: 'center'
                }}>
                <div style={{ fontSize: '18px', marginBottom: '4px' }}>🚩</div>
                <div style={{ color: '#666', fontSize: '10px' }}>Corners attendus</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{result.corners.total}</div>
                <div style={{ fontSize: '10px', color: result.corners.over85 >= 55 ? '#22c55e' : '#888', marginTop: '4px' }}>
                  {result.corners.prediction} ({Math.max(result.corners.over85, 100 - result.corners.over85)}%)
                </div>
              </div>)}

            {/* Cartons */}
            {result.cards && (<div style={{
                    padding: '10px',
                    background: '#1a1a1a',
                    borderRadius: '8px',
                    textAlign: 'center'
                }}>
                <div style={{ fontSize: '18px', marginBottom: '4px' }}>🟨</div>
                <div style={{ color: '#666', fontSize: '10px' }}>Cartons attendus</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{result.cards.total}</div>
                <div style={{ fontSize: '10px', color: result.cards.over45 >= 55 ? '#eab308' : '#888', marginTop: '4px' }}>
                  {result.cards.prediction} ({Math.max(result.cards.over45, 100 - result.cards.over45)}%)
                </div>
              </div>)}
          </div>

          {/* Section Enrichissement API-Football */}
          {loadingEnrichment && (<div style={{
                    marginTop: '12px',
                    padding: '12px',
                    background: '#1a1a1a',
                    borderRadius: '8px',
                    textAlign: 'center',
                    color: '#888',
                    fontSize: '12px'
                }}>
              ⏳ Chargement des données supplémentaires (blessures, forme, H2H)...
            </div>)}

          {enrichment && !loadingEnrichment && (<div style={{ marginTop: '12px' }}>
              {/* Blessures et Suspensions */}
              {(((_b = enrichment.homeInjuries) === null || _b === void 0 ? void 0 : _b.length) > 0 || ((_c = enrichment.awayInjuries) === null || _c === void 0 ? void 0 : _c.length) > 0) && (<div style={{
                        background: '#2a1a1a',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '8px',
                        border: '1px solid #ef444430'
                    }}>
                  <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>
                    🏥 Blessures & Suspensions
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '10px' }}>
                    <div>
                      <div style={{ color: '#888', marginBottom: '4px' }}>{result.match.homeTeam}</div>
                      {(_d = enrichment.homeInjuries) === null || _d === void 0 ? void 0 : _d.slice(0, 3).map(function (inj, i) { return (<div key={i} style={{ color: '#ef4444', marginBottom: '2px' }}>
                          • {inj.player} ({inj.type})
                        </div>); })}
                      {((_e = enrichment.homeInjuries) === null || _e === void 0 ? void 0 : _e.length) === 0 && <div style={{ color: '#22c55e' }}>✓ Aucune blessure signalée</div>}
                    </div>
                    <div>
                      <div style={{ color: '#888', marginBottom: '4px' }}>{result.match.awayTeam}</div>
                      {(_f = enrichment.awayInjuries) === null || _f === void 0 ? void 0 : _f.slice(0, 3).map(function (inj, i) { return (<div key={i} style={{ color: '#ef4444', marginBottom: '2px' }}>
                          • {inj.player} ({inj.type})
                        </div>); })}
                      {((_g = enrichment.awayInjuries) === null || _g === void 0 ? void 0 : _g.length) === 0 && <div style={{ color: '#22c55e' }}>✓ Aucune blessure signalée</div>}
                    </div>
                  </div>
                </div>)}

              {/* Forme récente */}
              {(enrichment.homeForm || enrichment.awayForm) && (<div style={{
                        background: '#1a2a1a',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '8px',
                        border: '1px solid #22c55e30'
                    }}>
                  <div style={{ color: '#22c55e', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>
                    📊 Forme Récente
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '10px' }}>
                    <div>
                      <div style={{ color: '#888', marginBottom: '4px' }}>{result.match.homeTeam}</div>
                      {enrichment.homeForm ? (<>
                          <div style={{ color: '#fff', marginBottom: '2px' }}>Forme: {enrichment.homeForm.form}</div>
                          <div style={{ color: '#888' }}>Buts: {enrichment.homeForm.goalsScored} marqués, {enrichment.homeForm.goalsConceded} encaissés</div>
                        </>) : (<div style={{ color: '#666' }}>Non disponible</div>)}
                    </div>
                    <div>
                      <div style={{ color: '#888', marginBottom: '4px' }}>{result.match.awayTeam}</div>
                      {enrichment.awayForm ? (<>
                          <div style={{ color: '#fff', marginBottom: '2px' }}>Forme: {enrichment.awayForm.form}</div>
                          <div style={{ color: '#888' }}>Buts: {enrichment.awayForm.goalsScored} marqués, {enrichment.awayForm.goalsConceded} encaissés</div>
                        </>) : (<div style={{ color: '#666' }}>Non disponible</div>)}
                    </div>
                  </div>
                </div>)}

              {/* Historique H2H */}
              {enrichment.h2h && enrichment.h2h.length > 0 && (<div style={{
                        background: '#1a1a2a',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '8px',
                        border: '1px solid #3b82f630'
                    }}>
                  <div style={{ color: '#3b82f6', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>
                    ⚔️ Historique des Confrontations
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '10px' }}>
                    {enrichment.h2h.slice(0, 5).map(function (h2hMatch, i) { return (<div key={i} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '6px',
                            background: '#0a0a0a',
                            borderRadius: '4px'
                        }}>
                        <span style={{ color: '#888' }}>
                          {new Date(h2hMatch.date).toLocaleDateString('fr-FR')}
                        </span>
                        <span style={{ color: '#fff' }}>
                          {h2hMatch.homeTeam} {h2hMatch.homeScore} - {h2hMatch.awayScore} {h2hMatch.awayTeam}
                        </span>
                        <span style={{ color: '#666', fontSize: '9px' }}>
                          {h2hMatch.competition}
                        </span>
                      </div>); })}
                  </div>
                </div>)}
            </div>)}

          {/* Note de confiance */}
          <div style={{
                marginTop: '12px',
                padding: '10px',
                background: '#1a1a1a',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
            <span style={{ color: '#666', fontSize: '11px' }}>Confiance de l'analyse:</span>
            <span style={{
                fontSize: '13px',
                fontWeight: 'bold',
                color: result.confidence === 'high' ? '#22c55e' : result.confidence === 'medium' ? '#f97316' : '#ef4444'
            }}>
              {result.confidence === 'high' ? '✅ Haute' : result.confidence === 'medium' ? '⚠️ Moyenne' : '❌ Faible'}
            </span>
          </div>
        </div>)}
    </div>);
}
