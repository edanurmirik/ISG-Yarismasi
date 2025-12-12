import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import './App.css';
import { auth, db } from './firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';

const menuItems = [
  { key: 'dashboard', label: 'Kontrol Paneli' },
  { key: 'firms', label: 'Firmalar' },
  { key: 'games', label: 'Oyunlar' },
  { key: 'settings', label: 'Ayarlar' },
  { key: 'management', label: 'Skorlar' },
];

function PlayerLogin({ playerId, firmName, onLogin }) {
  const [inputId, setInputId] = useState(playerId || '');
  const [selectedFirm, setSelectedFirm] = useState(firmName || '');
  const [firms, setFirms] = useState([]);
  const [loadingFirms, setLoadingFirms] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const loadFirms = async () => {
      try {
        setLoadingFirms(true);
        setError('');
        console.log('Firebase bağlantısı kontrol ediliyor...');
        console.log('DB:', db);
        
        const snapshot = await getDocs(collection(db, 'firms'));
        console.log('Snapshot alındı:', snapshot);
        console.log('Doküman sayısı:', snapshot.docs.length);
        
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        console.log('Firmalar yüklendi:', items);
        
        if (items.length === 0) {
          setError('Henüz kayıtlı firma bulunmuyor. Admin panelinden firma ekleyin.');
        } else {
          setFirms(items);
        }
      } catch (err) {
        console.error('Firmalar yükleme hatası:', err);
        console.error('Hata kodu:', err.code);
        console.error('Hata mesajı:', err.message);
        
        let errorMessage = 'Firmalar yüklenemedi. ';
        if (err.code === 'permission-denied') {
          errorMessage += 'Firebase Firestore kurallarını kontrol edin. Okuma izni gerekli.';
        } else if (err.code === 'unavailable') {
          errorMessage += 'Firebase bağlantısı kurulamadı. İnternet bağlantınızı kontrol edin.';
        } else if (err.message) {
          errorMessage += err.message;
        } else {
          errorMessage += 'Lütfen sayfayı yenileyin veya daha sonra tekrar deneyin.';
        }
        
        setError(errorMessage);
      } finally {
        setLoadingFirms(false);
      }
    };
    loadFirms();
  }, []);

  const isValid = useMemo(
    () => inputId.trim().length > 2 && selectedFirm.trim().length > 0,
    [inputId, selectedFirm]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) {
      setError('Lütfen oyuncu ID girin ve bir firma seçin.');
      return;
    }
    setError('');
    onLogin(inputId.trim(), selectedFirm.trim());
    navigate('/oyun', { replace: true });
  };

  const handleFirmChange = (e) => {
    setSelectedFirm(e.target.value);
  };

  return (
    <div className="player-shell">
      <div className="player-card">
        <p className="pill">Oyuncu Girişi</p>
        <h1>İş Güvenliği Yarışması</h1>

        <form className="player-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Oyuncu ID</span>
            <input
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              placeholder="örn: ekip-42"
              required
            />
          </label>
          
          <div className="field">
            <span>Firma Seç</span>
            {loadingFirms ? (
              <select disabled className="firm-select">
                <option>Firmalar yükleniyor...</option>
              </select>
            ) : firms.length > 0 ? (
              <select
                value={selectedFirm}
                onChange={handleFirmChange}
                className="firm-select"
                required
              >
                <option value="">Firma seçin...</option>
                {firms.map((firm) => (
                  <option key={firm.id} value={firm.name}>
                    {firm.name}
                  </option>
                ))}
              </select>
            ) : (
              <select disabled className="firm-select">
                <option>Firma bulunamadı</option>
              </select>
            )}
          </div>
          
          {error ? <div className="alert">{error}</div> : null}
          <button className="primary" type="submit" disabled={!isValid}>
            Oyuna Gir
          </button>
        </form>
      </div>
    </div>
  );
}

function GameHub({ playerId, firmName, onLogout }) {
  const navigate = useNavigate();
  const [activeGames, setActiveGames] = useState([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [scores, setScores] = useState([]);
  const [loadingScores, setLoadingScores] = useState(true);
  const [showScores, setShowScores] = useState({}); // { gameName: boolean }

  useEffect(() => {
    const loadFirmGames = async () => {
      try {
        setLoadingGames(true);
        const snapshot = await getDocs(collection(db, 'firms'));
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        
        const normalizedSearch = firmName.toLowerCase().trim();
        const firm = items.find((f) => {
          const normalizedName = (f.name || '').toLowerCase().trim();
          return normalizedName === normalizedSearch || 
                 normalizedName.includes(normalizedSearch) ||
                 normalizedSearch.includes(normalizedName);
        });
        
        if (!firm) {
          console.error('Firma bulunamadı:', firmName);
          setActiveGames([]);
          setLoadingGames(false);
          return;
        }
        
        const games = firm.games || [];
        const active = [];
        const addedGameNames = new Set(); // Track added games to prevent duplicates
        
        // Check Tehlike Avı - sadece aktiflik durumuna göre
        const dangerGame = games.find((g) => g.name === 'Tehlike Avı');
        if (dangerGame && dangerGame.status === 'Aktif' && !addedGameNames.has('Tehlike Avı')) {
          active.push({
            name: 'Tehlike Avı',
            route: '/oyun/tehlike-avi',
            description: 'Riskleri hızlıca tespit edin ve puan toplayın.',
          });
          addedGameNames.add('Tehlike Avı');
        }
        
        // Check Kart Eşleştirme - sadece aktiflik durumuna göre
        const matchingGame = games.find((g) => g.name === 'Kart Eşleştirme');
        if (matchingGame && matchingGame.status === 'Aktif' && !addedGameNames.has('Kart Eşleştirme')) {
          active.push({
            name: 'Kart Eşleştirme',
            route: '/oyun/kart-eslestirme',
            description: 'Eşleşmeleri bulun, güvenlik ipuçlarını pekiştirin.',
          });
          addedGameNames.add('Kart Eşleştirme');
        }
        
        setActiveGames(active);
        setLoadingGames(false);
      } catch (err) {
        console.error('Oyunlar yüklenemedi:', err);
        setActiveGames([]);
        setLoadingGames(false);
      }
    };
    
    if (firmName) {
      loadFirmGames();
    }
  }, [firmName]);

  // Load scores for the firm
  useEffect(() => {
    const loadScores = async () => {
      try {
        setLoadingScores(true);
        const normalizedSearch = firmName.toLowerCase().trim();
        const q = query(
          collection(db, 'gameScores'),
          where('firmName', '>=', normalizedSearch),
          where('firmName', '<=', normalizedSearch + '\uf8ff'),
          orderBy('firmName'),
          orderBy('timestamp', 'desc')
        );
        const snapshot = await getDocs(q);
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        
        // Filter by exact firm name match (case-insensitive)
        const filteredScores = items.filter((score) => {
          const scoreFirmName = (score.firmName || '').toLowerCase().trim();
          return scoreFirmName === normalizedSearch;
        });
        
        setScores(filteredScores);
      } catch (err) {
        console.error('Skorlar yüklenemedi:', err);
        // Fallback: try without orderBy if it fails
        try {
          const snapshot = await getDocs(collection(db, 'gameScores'));
          const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          const normalizedSearch = firmName.toLowerCase().trim();
          const filteredScores = items.filter((score) => {
            const scoreFirmName = (score.firmName || '').toLowerCase().trim();
            return scoreFirmName === normalizedSearch;
          });
          // Sort by timestamp descending
          filteredScores.sort((a, b) => {
            const timeA = a.timestamp?.toDate?.() || new Date(a.createdAt || 0);
            const timeB = b.timestamp?.toDate?.() || new Date(b.createdAt || 0);
            return timeB - timeA;
          });
          setScores(filteredScores);
        } catch (fallbackErr) {
          console.error('Skorlar yüklenemedi (fallback):', fallbackErr);
          setScores([]);
        }
      } finally {
        setLoadingScores(false);
      }
    };
    
    if (firmName) {
      loadScores();
    }
  }, [firmName]);

  if (!playerId || !firmName) {
    return <Navigate to="/" replace />;
  }

  if (loadingGames) {
    return (
      <div className="game-shell">
        <header className="game-top">
          <div>
            <p className="eyebrow">Oyuncu</p>
            <h2>{playerId}</h2>
            <p className="muted" style={{ fontSize: '14px', marginTop: '4px' }}>Firma: {firmName}</p>
          </div>
          <div className="game-actions">
            <button className="secondary" onClick={onLogout}>
              Çıkış Yap
            </button>
          </div>
        </header>
        <div className="game-grid">
          <p className="muted">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (activeGames.length === 0) {
    return (
      <div className="game-shell">
        <header className="game-top">
          <div>
            <p className="eyebrow">Oyuncu</p>
            <h2>{playerId}</h2>
            <p className="muted" style={{ fontSize: '14px', marginTop: '4px' }}>Firma: {firmName}</p>
          </div>
          <div className="game-actions">
            <button className="secondary" onClick={onLogout}>
              Çıkış Yap
            </button>
          </div>
        </header>
        <div className="game-grid">
          <div className="tehlike-avi-info">
            <p className="muted">{firmName} firması için aktif oyun bulunmuyor.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-shell">
      <header className="game-top">
        <div>
          <p className="eyebrow">Oyuncu</p>
          <h2>{playerId}</h2>
          <p className="muted" style={{ fontSize: '14px', marginTop: '4px' }}>{firmName}</p>
        </div>
        <div className="game-actions">
          <button className="secondary" onClick={onLogout}>
            Çıkış Yap
          </button>
        </div>
      </header>

      <div className="game-grid">
        {activeGames.map((game) => {
          const gameScores = scores.filter((score) => score.gameName === game.name);
          const isShowingScores = showScores[game.name] || false;
          
          return (
            <div key={game.name}>
              <div className="game-card">
                <p className="pill">Oyun</p>
                <h3>{game.name}</h3>
                <p>{game.description}</p>
                <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                  <button
                    className="primary full"
                    onClick={() => navigate(game.route)}
                  >
                    Oyuna Başla
                  </button>
                  <button
                    className="secondary full"
                    onClick={() => setShowScores((prev) => ({
                      ...prev,
                      [game.name]: !prev[game.name]
                    }))}
                  >
                    {isShowingScores ? '📊 Skorları Gizle' : '📊 Skorları Göster'}
                  </button>
                </div>
              </div>
              
              {isShowingScores && (
                <div className="scores-section" style={{ marginTop: '20px' }}>
                  <h4 style={{ marginBottom: '15px', color: '#cdd7e3' }}>
                    {game.name} - Skor Listesi
                  </h4>
                  {loadingScores ? (
                    <p className="muted">Yükleniyor...</p>
                  ) : gameScores.length === 0 ? (
                    <p className="muted">Bu oyun için henüz skor kaydı bulunmuyor.</p>
                  ) : (
                    <div className="scores-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Oyuncu ID</th>
                            <th>Skor</th>
                            <th>Tarih</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gameScores
                            .sort((a, b) => {
                              // Sort by score descending, then by date descending
                              if (b.score !== a.score) {
                                return b.score - a.score;
                              }
                              const timeA = a.timestamp?.toDate?.() || new Date(a.createdAt || 0);
                              const timeB = b.timestamp?.toDate?.() || new Date(b.createdAt || 0);
                              return timeB - timeA;
                            })
                            .map((score) => {
                              const scoreDate = score.timestamp?.toDate?.() || new Date(score.createdAt || Date.now());
                              const isCurrentPlayer = score.playerId === playerId;
                              return (
                                <tr key={score.id} className={isCurrentPlayer ? 'current-player-row' : ''}>
                                  <td>
                                    {score.playerId}
                                    {isCurrentPlayer && <span className="current-player-badge"> (Siz)</span>}
                                  </td>
                                  <td>
                                    <span className={`score-value ${score.score >= 70 ? 'score-good' : score.score >= 40 ? 'score-medium' : 'score-low'}`}>
                                      {score.score}
                                    </span>
                                  </td>
                                  <td>{scoreDate.toLocaleString('tr-TR')}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KartEslestirmePlay({ playerId, firmName, onBack }) {
  const [pairs, setPairs] = useState([]);
  const [cards, setCards] = useState([]);
  const [flippedCards, setFlippedCards] = useState([]); // [index1, index2] - currently flipped cards
  const [matchedCards, setMatchedCards] = useState(new Set()); // Set of matched card indices
  const [loadingPairs, setLoadingPairs] = useState(true);
  const [gameComplete, setGameComplete] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(180); // 180 seconds = 3 minutes
  const [gameFailed, setGameFailed] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const scoreSavedRef = useRef(false); // Track if score has been saved

  useEffect(() => {
    const loadFirmPairs = async () => {
      try {
        setLoadingPairs(true);
        const snapshot = await getDocs(collection(db, 'firms'));
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        
        const normalizedSearch = firmName.toLowerCase().trim();
        const firm = items.find((f) => {
          const normalizedName = (f.name || '').toLowerCase().trim();
          return normalizedName === normalizedSearch || 
                 normalizedName.includes(normalizedSearch) ||
                 normalizedSearch.includes(normalizedName);
        });
        
        if (!firm) {
          console.error('Firma bulunamadı:', firmName);
          setLoadingPairs(false);
          return;
        }
        
        const matchingGame = (firm.games || []).find((g) => g.name === 'Kart Eşleştirme');
        if (!matchingGame) {
          console.error('Kart Eşleştirme oyunu bulunamadı');
          setLoadingPairs(false);
          return;
        }
        
        if (matchingGame.status !== 'Aktif') {
          console.error('Oyun durumu Aktif değil:', matchingGame.status);
          setLoadingPairs(false);
          return;
        }
        
        const gamePairs = matchingGame.pairs || [];
        if (gamePairs.length === 0) {
          console.error('Eşleştirme çiftleri bulunamadı');
          setLoadingPairs(false);
          return;
        }
        
        setPairs(gamePairs);
        
        // Create cards: each pair creates 2 cards (one symbol, one meaning)
        const cardList = [];
        gamePairs.forEach((pair, pairIndex) => {
          // Symbol card
          cardList.push({
            id: `symbol-${pairIndex}`,
            type: 'symbol',
            content: pair.symbol,
            pairId: pairIndex,
            pairIndex: pairIndex,
          });
          // Meaning card
          cardList.push({
            id: `meaning-${pairIndex}`,
            type: 'meaning',
            content: pair.meaning,
            pairId: pairIndex,
            pairIndex: pairIndex,
          });
        });
        
        // Shuffle cards
        for (let i = cardList.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [cardList[i], cardList[j]] = [cardList[j], cardList[i]];
        }
        
        setCards(cardList);
        setLoadingPairs(false);
        // Start timer when game loads
        setTimeRemaining(180);
        setGameFailed(false);
        setClickCount(0);
        scoreSavedRef.current = false; // Reset score saved flag for new game
      } catch (err) {
        console.error('Eşleştirme çiftleri yüklenemedi:', err);
        setLoadingPairs(false);
      }
    };
    
    if (firmName) {
      loadFirmPairs();
    }
  }, [firmName]);

  // Timer effect
  useEffect(() => {
    if (gameFailed || gameComplete || cards.length === 0) return;
    
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setGameFailed(true);
          // Calculate final score (0 because time ran out)
          setFinalScore(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [gameFailed, gameComplete, cards.length]);

  // Calculate score when game completes
  useEffect(() => {
    if (gameComplete && !gameFailed) {
      const totalPairs = pairs.length;
      // Ideal clicks = total pairs (one click per pair to match)
      // But since we need 2 clicks per pair (one for each card), ideal = totalPairs * 2
      const idealClicks = totalPairs * 2;
      // Score decreases as clicks increase beyond ideal
      const score = Math.max(0, Math.round((idealClicks / clickCount) * 100));
      setFinalScore(Math.min(100, score)); // Cap at 100
    }
  }, [gameComplete, gameFailed, pairs.length, clickCount]);

  // Save score to database when game completes or fails
  useEffect(() => {
    // Only proceed if game is finished and we have required data
    if (!(gameComplete || gameFailed) || !playerId || !firmName) {
      return;
    }
    
    // Prevent multiple saves
    if (scoreSavedRef.current) {
      console.log('⏭️ Skor zaten kaydedilmiş, tekrar kaydedilmiyor');
      return;
    }
    
    // Mark as saving immediately to prevent duplicate saves
    scoreSavedRef.current = true;
    
    const saveScore = async () => {
      try {
        console.log('🎮 [KART EŞLEŞTİRME] Skor kaydetme başlatıldı:', { 
          gameComplete, 
          gameFailed, 
          finalScore, 
          playerId, 
          firmName, 
          clickCount, 
          pairsLength: pairs.length 
        });
        
        const normalizedPlayerId = playerId.trim();
        const normalizedFirmName = firmName.trim();
        
        if (!normalizedPlayerId || !normalizedFirmName) {
          console.error('❌ [KART EŞLEŞTİRME] PlayerId veya firmName boş!', { normalizedPlayerId, normalizedFirmName });
          scoreSavedRef.current = false;
          return;
        }
        
        // Calculate score if not already calculated
        let calculatedScore = finalScore;
        if (gameComplete && !gameFailed) {
          if (finalScore === 0 && pairs.length > 0 && clickCount > 0) {
            const totalPairs = pairs.length;
            const idealClicks = totalPairs * 2;
            calculatedScore = Math.max(0, Math.round((idealClicks / clickCount) * 100));
            calculatedScore = Math.min(100, calculatedScore);
            console.log('🔄 [KART EŞLEŞTİRME] Skor yeniden hesaplandı:', { calculatedScore, totalPairs, idealClicks, clickCount });
          }
        }
        
        const newScore = gameFailed ? 0 : calculatedScore;
        console.log('📊 [KART EŞLEŞTİRME] Final skor:', { newScore, calculatedScore, finalScore, gameFailed });
        
        // Get all scores and filter manually (more reliable than complex queries)
        let existingScores = [];
        try {
          const allScores = await getDocs(collection(db, 'gameScores'));
          allScores.forEach((doc) => {
            const data = doc.data();
            if (data.playerId === normalizedPlayerId && 
                data.firmName === normalizedFirmName && 
                data.gameName === 'Kart Eşleştirme') {
              existingScores.push({ id: doc.id, ...data });
            }
          });
          console.log('📋 [KART EŞLEŞTİRME] Mevcut skorlar bulundu:', existingScores.length);
        } catch (err) {
          console.error('❌ [KART EŞLEŞTİRME] Skorlar alınamadı:', err);
          scoreSavedRef.current = false;
          return;
        }
        
        // Find highest existing score
        let maxExistingScore = -1;
        existingScores.forEach((score) => {
          if (score.score > maxExistingScore) {
            maxExistingScore = score.score;
          }
        });
        
        // Only save if new score is higher than existing score (or if it's the first time)
        // For first time players, always save (even if score is 0)
        if (existingScores.length > 0 && maxExistingScore >= 0 && newScore <= maxExistingScore) {
          console.log('⏭️ [KART EŞLEŞTİRME] Yeni skor daha düşük veya eşit, kaydedilmiyor. Mevcut:', maxExistingScore, 'Yeni:', newScore);
          return;
        }
        
        // If it's the first time playing, always save (even if score is 0)
        if (existingScores.length === 0) {
          console.log('✨ [KART EŞLEŞTİRME] İlk oyun, skor kaydedilecek (skor:', newScore, ')');
        }
        
        // Delete old scores if new one is higher
        if (existingScores.length > 0) {
          console.log('🗑️ [KART EŞLEŞTİRME] Eski skor(lar) siliniyor...', existingScores.length);
          for (const score of existingScores) {
            try {
              await deleteDoc(doc(db, 'gameScores', score.id));
            } catch (deleteErr) {
              console.error('❌ [KART EŞLEŞTİRME] Skor silinemedi:', deleteErr);
            }
          }
        }
        
        // Save new score
        const scoreData = {
          playerId: normalizedPlayerId,
          firmName: normalizedFirmName,
          gameName: 'Kart Eşleştirme',
          score: newScore,
          gameDetails: {
            clickCount: clickCount,
            pairsCount: pairs.length,
            timeRemaining: timeRemaining,
            completed: gameComplete && !gameFailed,
            failed: gameFailed,
          },
          timestamp: serverTimestamp(),
          createdAt: new Date().toISOString(),
        };
        
        console.log('💾 [KART EŞLEŞTİRME] Skor kaydediliyor...', scoreData);
        const docRef = await addDoc(collection(db, 'gameScores'), scoreData);
        console.log('✅✅✅ [KART EŞLEŞTİRME] SKOR BAŞARIYLA KAYDEDİLDİ! Doc ID:', docRef.id);
        console.log('📄 Kaydedilen veri:', scoreData);
      } catch (err) {
        console.error('❌❌❌ [KART EŞLEŞTİRME] Skor kaydedilemedi:', err);
        console.error('Hata detayları:', err.message, err.stack);
        scoreSavedRef.current = false;
      }
    };
    
    // Execute save
    saveScore();
  }, [gameComplete, gameFailed, playerId, firmName, finalScore, clickCount, pairs.length, timeRemaining]);

  const handleCardClick = (cardIndex) => {
    // Don't allow clicking if:
    // - Card is already matched
    // - Card is already flipped
    // - Two cards are already flipped (waiting for match check)
    // - Game is failed or complete
    if (matchedCards.has(cardIndex) || flippedCards.includes(cardIndex) || flippedCards.length >= 2 || gameFailed || gameComplete) {
      return;
    }
    
    // Increment click count
    setClickCount((prev) => prev + 1);
    
    const newFlipped = [...flippedCards, cardIndex];
    setFlippedCards(newFlipped);
    
    // If two cards are flipped, check for match
    if (newFlipped.length === 2) {
      const card1 = cards[newFlipped[0]];
      const card2 = cards[newFlipped[1]];
      
      // Check if they are a matching pair (one symbol, one meaning, same pairId)
      if (card1.pairId === card2.pairId && card1.type !== card2.type) {
        // Match found! Keep them flipped
        setMatchedCards((prev) => {
          const newMatched = new Set(prev);
          newMatched.add(newFlipped[0]);
          newMatched.add(newFlipped[1]);
          
          // Check if all cards are matched
          if (newMatched.size === cards.length) {
            setGameComplete(true);
          }
          
          return newMatched;
        });
        setFlippedCards([]);
      } else {
        // No match, flip them back after a delay
        setTimeout(() => {
          setFlippedCards([]);
        }, 1000);
      }
    }
  };

  if (!playerId || !firmName) {
    return <Navigate to="/" replace />;
  }

  if (loadingPairs) {
    return (
      <div className="game-shell">
        <header className="game-top">
          <button className="secondary" onClick={onBack}>
            ← Geri
          </button>
          <h2>Kart Eşleştirme</h2>
        </header>
        <div className="kart-eslestirme-container">
          <p className="muted">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (pairs.length === 0 && !loadingPairs) {
    return (
      <div className="game-shell">
        <header className="game-top">
          <button className="secondary" onClick={onBack}>
            ← Geri
          </button>
          <h2>Kart Eşleştirme</h2>
        </header>
        <div className="kart-eslestirme-container">
          <div className="tehlike-avi-info">
            <p className="muted">{firmName} firması için aktif eşleştirme çifti bulunmuyor.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-shell">
      <header className="game-top">
        <button className="secondary" onClick={onBack}>
          ← Geri
        </button>
        <div>
          <h2>Kart Eşleştirme</h2>
          <p className="muted" style={{ fontSize: '14px', marginTop: '4px' }}>
            {matchedCards.size / 2} / {pairs.length} eşleştirme tamamlandı
          </p>
        </div>
        <div className="game-stats-header">
          <div className="stat-item">
            <span className="stat-label">Kalan Süre:</span>
            <span className={`stat-value ${timeRemaining <= 30 ? 'time-warning' : ''}`}>
              {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Tıklanma:</span>
            <span className="stat-value">{clickCount}</span>
          </div>
        </div>
      </header>
      
      {(gameComplete || gameFailed) && (
        <div className="game-result-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="game-result-modal">
            <h2>{gameFailed ? '⏱ Süre Doldu' : '🎉 Tebrikler!'}</h2>
            <div className="game-result-content">
              {gameFailed ? (
                <p className="error" style={{ fontSize: '18px', marginBottom: '20px' }}>
                  Süre doldu! Oyun başarısız sayıldı.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: '18px', marginBottom: '20px' }}>
                    Tüm kartları başarıyla eşleştirdiniz!
                  </p>
                  <h3>Puanınız</h3>
                  <div className="final-score">
                    {finalScore}
                  </div>
                  <div className="score-breakdown">
                    <div className="score-item">
                      <span>Toplam Tıklanma:</span>
                      <span>{clickCount}</span>
                    </div>
                    <div className="score-item">
                      <span>Eşleştirme Sayısı:</span>
                      <span>{pairs.length}</span>
                    </div>
                    <div className="score-item">
                      <span>Kalan Süre:</span>
                      <span>{Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}</span>
                    </div>
                  </div>
                </>
              )}
              <button className="primary" onClick={onBack} style={{ marginTop: '20px' }}>
                Ana Menüye Dön
              </button>
            </div>
          </div>
        </div>
      )}
      
      {gameFailed && !gameComplete && (
        <div className="game-failed-banner">
          <p className="error">⏱ Süre doldu! Oyun başarısız sayıldı.</p>
        </div>
      )}
      
      <div className="kart-eslestirme-container">
        <div className="kart-eslestirme-grid">
          {cards.map((card, index) => {
            const isFlipped = flippedCards.includes(index);
            const isMatched = matchedCards.has(index);
            const showContent = isFlipped || isMatched;
            
            return (
              <div
                key={card.id}
                className={`kart-eslestirme-card ${showContent ? 'flipped' : ''} ${isMatched ? 'matched' : ''}`}
                onClick={() => handleCardClick(index)}
              >
                <div className="kart-eslestirme-card-front">
                  <div className="card-back-pattern">?</div>
                </div>
                <div className="kart-eslestirme-card-back">
                  {card.type === 'symbol' ? (
                    <img src={card.content} alt="Sembol" className="card-symbol-image" />
                  ) : (
                    <div className="card-meaning-text">{card.content}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CoordinateQuiz({ coordinate, onAnswer, onClose }) {
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [shuffledOptions, setShuffledOptions] = useState([]);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (coordinate?.options && coordinate.options.length === 4) {
      // Shuffle options but keep track of correct answer
      const options = [...coordinate.options];
      const correctIndex = coordinate.correctAnswer || 0;
      
      // Create array with indices
      const indices = [0, 1, 2, 3];
      // Shuffle indices
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      
      // Map shuffled indices to options
      setShuffledOptions(indices.map((originalIdx) => ({
        text: options[originalIdx],
        originalIndex: originalIdx,
        isCorrect: originalIdx === correctIndex
      })));
    }
  }, [coordinate]);

  const handleAnswer = (index) => {
    if (showResult) return;
    setSelectedAnswer(index);
    setShowResult(true);
    
    const isCorrect = shuffledOptions[index].isCorrect;
    
    setTimeout(() => {
      onAnswer(isCorrect);
      onClose();
    }, 1500);
  };

  if (!coordinate) return null;

  return (
    <div className="quiz-overlay" onClick={onClose}>
      <div className="quiz-modal" onClick={(e) => e.stopPropagation()}>
        <div className="quiz-header">
          <h3>Doğru seçeneği işaretleyin.</h3>
          <button className="secondary" onClick={onClose}>×</button>
        </div>
        <div className="quiz-content">
          <div className="quiz-options">
            {shuffledOptions.map((option, index) => {
              const isSelected = selectedAnswer === index;
              const showFeedback = showResult && isSelected;
              
              return (
                <button
                  key={index}
                  className={`quiz-option ${showFeedback ? (option.isCorrect ? 'correct' : 'incorrect') : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleAnswer(index)}
                  disabled={showResult}
                >
                  {option.text}
                  {showFeedback && option.isCorrect && <span className="quiz-check">✓</span>}
                  {showFeedback && !option.isCorrect && <span className="quiz-cross">×</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TehlikeAviPlay({ playerId, firmName, onBack }) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [images, setImages] = useState([]);
  const [foundCoordinates, setFoundCoordinates] = useState({}); // { imageIndex: { coordId: true } }
  const [imageRef, setImageRef] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [loadingImages, setLoadingImages] = useState(true);
  const [quizCoordinate, setQuizCoordinate] = useState(null);
  const [clickCounts, setClickCounts] = useState({}); // { imageIndex: count }
  const [timeRemaining, setTimeRemaining] = useState(60); // 60 seconds = 1 minute per image
  const [gameFailed, setGameFailed] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const [imageScores, setImageScores] = useState({}); // { imageIndex: score }
  const [showTimeUpModal, setShowTimeUpModal] = useState(false);
  const [completedImages, setCompletedImages] = useState(new Set()); // Track which images are completed (success or failed)
  const scoreSavedRef = useRef(false); // Track if score has been saved

  useEffect(() => {
    const loadFirmImages = async () => {
      try {
        setLoadingImages(true);
        const snapshot = await getDocs(collection(db, 'firms'));
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        
        console.log('Tüm firmalar:', items.map(f => f.name));
        console.log('Aranan firma adı:', firmName);
        
        // Find firm by name (case-insensitive, more flexible matching)
        const normalizedSearch = firmName.toLowerCase().trim();
        const firm = items.find((f) => {
          const normalizedName = (f.name || '').toLowerCase().trim();
          return normalizedName === normalizedSearch || 
                 normalizedName.includes(normalizedSearch) ||
                 normalizedSearch.includes(normalizedName);
        });
        
        if (!firm) {
          console.error('Firma bulunamadı. Aranan:', firmName);
          console.error('Mevcut firmalar:', items.map(f => f.name));
          setLoadingImages(false);
          return;
        }
        
        console.log('Firma bulundu:', firm.name);
        console.log('Firma oyunları:', firm.games);
        
        const dangerGame = (firm.games || []).find((g) => g.name === 'Tehlike Avı');
        if (!dangerGame) {
          console.error('Tehlike Avı oyunu bulunamadı');
          setLoadingImages(false);
          return;
        }
        
        console.log('Tehlike Avı oyunu:', dangerGame);
        console.log('Oyun durumu:', dangerGame.status);
        console.log('Assets:', dangerGame.assets);
        
        if (dangerGame.status !== 'Aktif') {
          console.error('Oyun durumu Aktif değil:', dangerGame.status);
          setLoadingImages(false);
          return;
        }
        
        if (!dangerGame.assets || dangerGame.assets.length === 0) {
          console.error('Assets array boş veya yok');
          setLoadingImages(false);
          return;
        }
        
        const firmImages = [];
        dangerGame.assets.forEach((asset, idx) => {
          const url = typeof asset === 'string' ? asset : asset.url;
          const coordinates = typeof asset === 'string' ? [] : (asset.coordinates || []);
          const assetId = typeof asset === 'string' ? Date.now().toString() : asset.id;
          
          if (!url) {
            console.warn('Asset URL yok, atlanıyor:', asset);
            return;
          }
          
          firmImages.push({
            url,
            firmId: firm.id,
            firmName: firm.name,
            coordinates: coordinates.map((coord, coordIdx) => ({
              ...coord,
              id: coord.id || `${assetId}-${coordIdx}`,
            })),
            assetId: assetId || `asset-${idx}`,
          });
        });
        
        console.log('Yüklenen görseller:', firmImages.length, firmImages);
        setImages(firmImages);
        setLoadingImages(false);
        scoreSavedRef.current = false; // Reset score saved flag for new game
      } catch (err) {
        console.error('Firma görselleri yüklenemedi:', err);
        setLoadingImages(false);
      }
    };
    
    if (firmName) {
      loadFirmImages();
    }
  }, [firmName]);

  const handleImageClick = (e) => {
    if (!imageRef || !imageLoaded || gameFailed || gameComplete) return;
    
    // Increment click count for current image
    setClickCounts((prev) => ({
      ...prev,
      [currentImageIndex]: (prev[currentImageIndex] || 0) + 1,
    }));
    
    const rect = imageRef.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Get image dimensions
    const imgWidth = imageRef.offsetWidth;
    const imgHeight = imageRef.offsetHeight;
    
    // Convert click position to percentage
    const clickXPercent = (clickX / imgWidth) * 100;
    const clickYPercent = (clickY / imgHeight) * 100;
    
    // Check if click is within any coordinate area
    const clickedCoord = currentCoords.find((coord) => {
      if (currentFound[coord.id]) return false; // Already found
      
      const coordLeft = coord.x;
      const coordTop = coord.y;
      const coordRight = coord.x + coord.width;
      const coordBottom = coord.y + coord.height;
      
      return (
        clickXPercent >= coordLeft &&
        clickXPercent <= coordRight &&
        clickYPercent >= coordTop &&
        clickYPercent <= coordBottom
      );
    });
    
    if (clickedCoord) {
      // Check if coordinate has quiz data
      if (clickedCoord.options && clickedCoord.options.length === 4 && clickedCoord.options[0]) {
        // Show quiz pop-up
        setQuizCoordinate(clickedCoord);
      } else {
        // No quiz, mark as found directly
        setFoundCoordinates((prev) => {
          const imageKey = currentImageIndex;
          const current = prev[imageKey] || {};
          return {
            ...prev,
            [imageKey]: {
              ...current,
              [clickedCoord.id]: true,
            },
          };
        });
      }
    }
  };

  const handleQuizAnswer = (isCorrect) => {
    if (isCorrect && quizCoordinate) {
      // Mark coordinate as found only if answer is correct
      setFoundCoordinates((prev) => {
        const imageKey = currentImageIndex;
        const current = prev[imageKey] || {};
        return {
          ...prev,
          [imageKey]: {
            ...current,
            [quizCoordinate.id]: true,
          },
        };
      });
    }
    setQuizCoordinate(null);
  };

  const currentImage = images[currentImageIndex];
  const currentFound = foundCoordinates[currentImageIndex] || {};
  const currentCoords = currentImage?.coordinates || [];
  const foundCount = currentCoords.filter((coord) => currentFound[coord.id]).length;
  const totalCount = currentCoords.length;
  const allFound = totalCount > 0 && foundCount === totalCount;
  const currentClickCount = clickCounts[currentImageIndex] || 0;

  // Calculate score for current image
  const calculateImageScore = (imageIdx) => {
    const image = images[imageIdx];
    if (!image) return 0;
    const coords = image.coordinates || [];
    const totalCoords = coords.length;
    if (totalCoords === 0) return 100;
    
    const clicks = clickCounts[imageIdx] || 0;
    if (clicks === 0) return 0;
    
    // Ideal clicks = total coordinates (one click per coordinate)
    const idealClicks = totalCoords;
    // Score decreases as clicks increase beyond ideal
    // Max score = 100, decreases proportionally
    const score = Math.max(0, Math.round((idealClicks / clicks) * 100));
    return Math.min(100, score); // Cap at 100
  };

  // Timer effect for each image
  useEffect(() => {
    if (gameFailed || gameComplete || !currentImage || showTimeUpModal) return;
    
    setTimeRemaining(60); // Reset to 60 seconds for new image
    
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setGameFailed(true);
          // Calculate final score for current image (0 because time ran out)
          setImageScores((prevScores) => ({
            ...prevScores,
            [currentImageIndex]: 0,
          }));
          // Mark this image as completed (failed)
          setCompletedImages((prev) => {
            const newSet = new Set(prev);
            newSet.add(currentImageIndex);
            return newSet;
          });
          // Show time up modal
          setShowTimeUpModal(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [currentImageIndex, currentImage, gameFailed, gameComplete, showTimeUpModal]);

  // Check if all images are completed (successfully or failed)
  useEffect(() => {
    if (images.length === 0) return;
    
    // Check if all images are completed (either successfully found all coordinates or failed due to time)
    const allImagesCompleted = images.every((img, idx) => {
      // Image is completed if:
      // 1. All coordinates are found, OR
      // 2. Time ran out for this image (it's in completedImages set)
      const coords = img.coordinates || [];
      const found = foundCoordinates[idx] || {};
      const foundCount = coords.filter((coord) => found[coord.id]).length;
      const allFound = coords.length > 0 && foundCount === coords.length;
      return completedImages.has(idx) || allFound;
    });
    
    if (allImagesCompleted && !gameComplete) {
      setGameComplete(true);
      // Calculate final scores for all images
      const finalScores = {};
      images.forEach((_, idx) => {
        if (imageScores[idx] === undefined) {
          // If score not set yet, calculate it
          finalScores[idx] = calculateImageScore(idx);
        } else {
          finalScores[idx] = imageScores[idx];
        }
      });
      setImageScores(finalScores);
    }
  }, [foundCoordinates, images, gameComplete, completedImages, imageScores]);

  // Save score to database when game completes
  useEffect(() => {
    // Only proceed if game is complete and we have required data
    if (!gameComplete || !playerId || !firmName || images.length === 0 || Object.keys(imageScores).length === 0) {
      return;
    }
    
    // Prevent multiple saves
    if (scoreSavedRef.current) {
      console.log('⏭️ [TEHLİKE AVI] Skor zaten kaydedilmiş, tekrar kaydedilmiyor');
      return;
    }
    
    // Mark as saving immediately to prevent duplicate saves
    scoreSavedRef.current = true;
    
    const saveScore = async () => {
      try {
        console.log('🎮 [TEHLİKE AVI] Skor kaydetme başlatıldı:', { 
          gameComplete, 
          playerId, 
          firmName, 
          imageScores, 
          imagesLength: images.length 
        });
        
        const normalizedPlayerId = playerId.trim();
        const normalizedFirmName = firmName.trim();
        
        if (!normalizedPlayerId || !normalizedFirmName) {
          console.error('❌ [TEHLİKE AVI] PlayerId veya firmName boş!', { normalizedPlayerId, normalizedFirmName });
          scoreSavedRef.current = false;
          return;
        }
        
        const totalScore = Object.values(imageScores).reduce((sum, score) => sum + score, 0) / images.length;
        const hasFailed = Object.values(imageScores).some(score => score === 0);
        const newScore = hasFailed ? 0 : Math.round(totalScore);
        
        console.log('📊 [TEHLİKE AVI] Final skor:', { newScore, totalScore, hasFailed, imageScores });
        
        // Get all scores and filter manually (more reliable than complex queries)
        let existingScores = [];
        try {
          const allScores = await getDocs(collection(db, 'gameScores'));
          allScores.forEach((doc) => {
            const data = doc.data();
            if (data.playerId === normalizedPlayerId && 
                data.firmName === normalizedFirmName && 
                data.gameName === 'Tehlike Avı') {
              existingScores.push({ id: doc.id, ...data });
            }
          });
          console.log('📋 [TEHLİKE AVI] Mevcut skorlar bulundu:', existingScores.length);
        } catch (err) {
          console.error('❌ [TEHLİKE AVI] Skorlar alınamadı:', err);
          scoreSavedRef.current = false;
          return;
        }
        
        // Find highest existing score
        let maxExistingScore = -1;
        existingScores.forEach((score) => {
          if (score.score > maxExistingScore) {
            maxExistingScore = score.score;
          }
        });
        
        // Only save if new score is higher than existing score (or if it's the first time)
        // For first time players, always save (even if score is 0)
        if (existingScores.length > 0 && maxExistingScore >= 0 && newScore <= maxExistingScore) {
          console.log('⏭️ [TEHLİKE AVI] Yeni skor daha düşük veya eşit, kaydedilmiyor. Mevcut:', maxExistingScore, 'Yeni:', newScore);
          return;
        }
        
        // If it's the first time playing, always save (even if score is 0)
        if (existingScores.length === 0) {
          console.log('✨ [TEHLİKE AVI] İlk oyun, skor kaydedilecek (skor:', newScore, ')');
        }
        
        // Delete old scores if new one is higher
        if (existingScores.length > 0) {
          console.log('🗑️ [TEHLİKE AVI] Eski skor(lar) siliniyor...', existingScores.length);
          for (const score of existingScores) {
            try {
              await deleteDoc(doc(db, 'gameScores', score.id));
            } catch (deleteErr) {
              console.error('❌ [TEHLİKE AVI] Skor silinemedi:', deleteErr);
            }
          }
        }
        
        // Save new score
        const scoreData = {
          playerId: normalizedPlayerId,
          firmName: normalizedFirmName,
          gameName: 'Tehlike Avı',
          score: newScore,
          gameDetails: {
            imageCount: images.length,
            imageScores: imageScores,
            clickCounts: clickCounts,
            completedImages: Array.from(completedImages),
            hasFailed: hasFailed,
          },
          timestamp: serverTimestamp(),
          createdAt: new Date().toISOString(),
        };
        
        console.log('💾 [TEHLİKE AVI] Skor kaydediliyor...', scoreData);
        const docRef = await addDoc(collection(db, 'gameScores'), scoreData);
        console.log('✅✅✅ [TEHLİKE AVI] SKOR BAŞARIYLA KAYDEDİLDİ! Doc ID:', docRef.id);
        console.log('📄 Kaydedilen veri:', scoreData);
      } catch (err) {
        console.error('❌❌❌ [TEHLİKE AVI] Skor kaydedilemedi:', err);
        console.error('Hata detayları:', err.message, err.stack);
        scoreSavedRef.current = false;
      }
    };
    
    // Execute save
    saveScore();
  }, [gameComplete, playerId, firmName, images.length, imageScores, clickCounts, completedImages]);

  // Calculate score when image is completed successfully
  useEffect(() => {
    if (allFound && !imageScores[currentImageIndex]) {
      const score = calculateImageScore(currentImageIndex);
      setImageScores((prev) => ({
        ...prev,
        [currentImageIndex]: score,
      }));
      // Mark this image as completed (successfully)
      setCompletedImages((prev) => {
        const newSet = new Set(prev);
        newSet.add(currentImageIndex);
        return newSet;
      });
    }
  }, [allFound, currentImageIndex]);

  const nextImage = () => {
    if (currentImageIndex < images.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
      setImageLoaded(false);
      setImageError(false);
      setTimeRemaining(60); // Reset timer for next image
      setGameFailed(false); // Reset failure state
      setShowTimeUpModal(false); // Close time up modal
    } else {
      // All images completed
      setGameComplete(true);
      setShowTimeUpModal(false); // Close time up modal
    }
  };

  const handleTimeUpContinue = () => {
    setShowTimeUpModal(false);
    // If it's the last image, show result screen immediately
    if (currentImageIndex === images.length - 1) {
      // Show result screen
      setGameComplete(true);
    } else {
      // Automatically move to next image
      nextImage();
    }
  };

  const prevImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
      setImageLoaded(false);
      setImageError(false);
      setShowTimeUpModal(false); // Reset time up modal when going back
    }
  };

  useEffect(() => {
    if (currentImage) {
      console.log('Görsel değişti:', currentImage.url);
      setImageLoaded(false);
      setImageError(false);
      setShowTimeUpModal(false); // Reset time up modal when image changes
    }
  }, [currentImageIndex, currentImage?.url]);

  const handleImageLoad = (e) => {
    setImageLoaded(true);
    setImageError(false);
  };

  if (!playerId || !firmName) {
    return <Navigate to="/" replace />;
  }

  if (loadingImages) {
    return (
      <div className="game-shell">
        <header className="game-top">
          <button className="secondary" onClick={onBack}>
            ← Geri
          </button>
          <h2>Tehlike Avı</h2>
        </header>
        <div className="tehlike-avi-container">
          <p className="muted">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (images.length === 0 && !loadingImages) {
    return (
      <div className="game-shell">
        <header className="game-top">
          <button className="secondary" onClick={onBack}>
            ← Geri
          </button>
          <h2>Tehlike Avı</h2>
        </header>
        <div className="tehlike-avi-container">
          <div className="tehlike-avi-info">
              {firmName} firması için aktif görsel bulunmuyor.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-shell">
      <header className="game-top">
        <button className="secondary" onClick={onBack}>
          ← Geri
        </button>
        <div>
          <p className="eyebrow">Tehlike Avı</p>
          <h2>
            Görsel {currentImageIndex + 1} / {images.length}
          </h2>
        </div>
        <div className="game-actions">
          <button className="secondary" onClick={onBack}>
            Çıkış
          </button>
        </div>
      </header>

      <div className="tehlike-avi-container">
        <div className="tehlike-avi-info">
          <p>
            <strong>{currentImage?.firmName}</strong> 
          </p>
          <div className="tehlike-avi-stats">
            <div className="stat-item">
              <span className="stat-label">Kalan Süre:</span>
              <span className={`stat-value ${timeRemaining <= 10 ? 'time-warning' : ''}`}>
                {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Tıklanma:</span>
              <span className="stat-value">{currentClickCount}</span>
            </div>
            {imageScores[currentImageIndex] !== undefined && (
              <div className="stat-item">
                <span className="stat-label">Puan:</span>
                <span className="stat-value score">{imageScores[currentImageIndex]}</span>
              </div>
            )}
          </div>
          <div className="tehlike-avi-progress">
            <p className="muted" style={{ marginTop: '8px', fontSize: '14px' }}>
              Görsel üzerinde tehlikeli noktaları bulmak için tıklayın.
            </p>
            {allFound && (
              <p className="success" style={{ marginTop: '8px', fontWeight: 'bold' }}>
                ✓ Tüm koordinatlar bulundu! Sonraki görsele geçebilirsiniz.
              </p>
            )}
            {gameFailed && (
              <p className="error" style={{ marginTop: '8px', fontWeight: 'bold' }}>
                ⏱ Süre doldu! Bu görsel için başarısız sayıldınız.
              </p>
            )}
          </div>
        </div>

        <div className="tehlike-avi-image-wrapper">
          <div 
            className="tehlike-avi-image-container"
            onClick={handleImageClick}
            style={{ cursor: 'crosshair' }}
          >
            {currentImage ? (
              imageError ? (
                <div className="danger-image-error">
                  <p>Görsel yüklenemedi</p>
                  <p className="muted">{currentImage.url}</p>
                  <button
                    className="secondary"
                    onClick={() => {
                      setImageError(false);
                      setImageLoaded(false);
                    }}
                  >
                    Tekrar Dene
                  </button>
                </div>
              ) : (
                <>
                  {!imageLoaded && !imageError && (
                    <div className="danger-image-loading">
                      <p>Yükleniyor...</p>
                    </div>
                  )}
                  <img
                    key={`${currentImage.url}-${currentImageIndex}`}
                    ref={(el) => setImageRef(el)}
                    src={currentImage.url}
                    alt="Tehlike Avı görseli"
                    onLoad={handleImageLoad}
                    onError={(e) => {
                      console.error('Görsel yüklenemedi:', currentImage.url, e);
                      setImageLoaded(false);
                      setImageError(true);
                    }}
                    className="tehlike-avi-image"
                    style={{
                      opacity: imageLoaded ? 1 : 0,
                      transition: 'opacity 0.3s ease',
                      pointerEvents: 'none',
                    }}
                  />
                  {/* Show found coordinates as visual feedback */}
                  {imageLoaded && imageRef && currentCoords.map((coord) => {
                    const isFound = currentFound[coord.id];
                    if (!isFound || !imageRef) return null;
                    
                    // Get displayed image dimensions
                    const imgWidth = imageRef.offsetWidth;
                    const imgHeight = imageRef.offsetHeight;
                    
                    // Calculate position based on percentage coordinates
                    const left = (coord.x / 100) * imgWidth;
                    const top = (coord.y / 100) * imgHeight;
                    const width = (coord.width / 100) * imgWidth;
                    const height = (coord.height / 100) * imgHeight;
                    
                    return (
                      <div
                        key={coord.id}
                        className="danger-coord-found"
                        style={{
                          position: 'absolute',
                          left: `${left}px`,
                          top: `${top}px`,
                          width: `${width}px`,
                          height: `${height}px`,
                          pointerEvents: 'none',
                        }}
                      >
                        <span className="coord-check">✓</span>
                      </div>
                    );
                  })}
                </>
              )
            ) : null}
          </div>
        </div>

        <div className="tehlike-avi-controls">
          <button
            className="secondary"
            onClick={prevImage}
            disabled={currentImageIndex === 0}
          >
            ← Önceki
          </button>
          <div className="tehlike-avi-stats">
          </div>
          <button
            className="primary"
            onClick={nextImage}
            disabled={currentImageIndex === images.length - 1 || !allFound || gameFailed}
            title={!allFound ? 'Tüm koordinatları bulmanız gerekiyor' : gameFailed ? 'Süre doldu' : ''}
          >
            {currentImageIndex === images.length - 1 ? 'Tamamla' : 'Sonraki →'}
          </button>
        </div>
      </div>
      {quizCoordinate && (
        <CoordinateQuiz
          coordinate={quizCoordinate}
          onAnswer={handleQuizAnswer}
          onClose={() => setQuizCoordinate(null)}
        />
      )}
      {showTimeUpModal && (
        <div className="quiz-overlay" onClick={handleTimeUpContinue}>
          <div className="quiz-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quiz-header">
              <h3>⏱ Süre Doldu!</h3>
            </div>
            <div className="quiz-content">
              <p style={{ fontSize: '16px', marginBottom: '20px', color: '#ff6b6b' }}>
                Bu görsel için başarısız sayıldınız.
              </p>
              <button className="primary" onClick={handleTimeUpContinue} style={{ width: '100%' }}>
                {currentImageIndex === images.length - 1 ? 'Sonuçları Gör' : 'Sonraki Görsele Geç'}
              </button>
            </div>
          </div>
        </div>
      )}
      {gameComplete && !showTimeUpModal && (
        <div className="game-result-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="game-result-modal">
            <h2>Oyun Sonu</h2>
            <div className="game-result-content">
              {completedImages.size > 0 && Object.values(imageScores).some(score => score === 0) && (
                <p className="error" style={{ fontSize: '18px', marginBottom: '20px' }}>
                  ⏱ Bazı görseller için süre doldu! Oyun başarısız sayıldı.
                </p>
              )}
              {!Object.values(imageScores).some(score => score === 0) && (
                <>
                  <h3>Toplam Puan</h3>
                  <div className="final-score">
                    {Object.values(imageScores).reduce((sum, score) => sum + score, 0) / images.length}
                  </div>
                </>
              )}
              <div className="score-breakdown" style={{ marginTop: !Object.values(imageScores).some(score => score === 0) ? '0' : '20px' }}>
                <h4>Görsel Bazında Puanlar:</h4>
                {images.map((img, idx) => (
                  <div key={idx} className="score-item">
                    <span>Görsel {idx + 1}:</span>
                    <span className={imageScores[idx] >= 70 ? 'score-good' : imageScores[idx] >= 40 ? 'score-medium' : 'score-low'}>
                      {imageScores[idx] || 0} puan ({clickCounts[idx] || 0} tıklanma)
                    </span>
                  </div>
                ))}
              </div>
              <button className="primary" onClick={onBack} style={{ marginTop: '20px' }}>
                Ana Menüye Dön
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CoordinateMarker({ imageData, onSave, onClose }) {
  const assetUrl = typeof imageData.asset === 'string' ? imageData.asset : imageData.asset.url;
  const initialCoords = typeof imageData.asset === 'string' ? [] : (imageData.asset.coordinates || []);
  
  const [coordinates, setCoordinates] = useState(initialCoords);
  const [imageRef, setImageRef] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState(null);
  const [editingCoord, setEditingCoord] = useState(null);
  const [coordOptions, setCoordOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState(0);

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    const coords = typeof imageData.asset === 'string' ? [] : (imageData.asset.coordinates || []);
    setCoordinates(coords);
    setEditingCoord(null);
    setCoordOptions(['', '', '', '']);
    setCorrectAnswer(0);
  }, [imageData.asset]);

  const getImageRect = (e) => {
    if (!imageRef) return { x: 0, y: 0 };
    const rect = imageRef.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  };

  const handleMouseDown = (e) => {
    if (!imageLoaded || imageError) return;
    if (e.target.closest('.coord-marker-rectangle')) return;
    const pos = getImageRect(e);
    setIsDrawing(true);
    setStartPos(pos);
    setCurrentRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !imageLoaded || imageError) return;
    const pos = getImageRect(e);
    const newRect = {
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y),
    };
    setCurrentRect(newRect);
  };

  const handleMouseUp = () => {
    if (isDrawing && currentRect && currentRect.width > 2 && currentRect.height > 2) {
      const newCoord = { 
        ...currentRect, 
        id: Date.now().toString(),
        options: ['', '', '', ''],
        correctAnswer: 0
      };
      setCoordinates([...coordinates, newCoord]);
      setEditingCoord(newCoord.id);
      setCoordOptions(['', '', '', '']);
      setCorrectAnswer(0);
      
      // Scroll to form after a short delay
      setTimeout(() => {
        const formElement = document.getElementById('coord-edit-form');
        if (formElement) {
          formElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
    setIsDrawing(false);
    setCurrentRect(null);
  };

  const removeCoordinate = (coordId) => {
    setCoordinates(coordinates.filter((c) => c.id !== coordId));
  };

  const handleSave = () => {
    onSave(coordinates);
    onClose();
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(false);
  };

  return (
    <div className="coord-marker-overlay" onClick={onClose}>
      <div className="coord-marker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="coord-marker-header">
          <h3>Tehlikeli Noktaları İşaretle</h3>
          <button className="secondary" onClick={onClose}>
            Kapat
          </button>
        </div>
        <div className="coord-marker-content">
          <p className="muted">
            Görsel üzerinde tehlikeli alanları işaretlemek için tıklayıp sürükleyin.
          </p>
          <div className="coord-marker-image-wrapper">
            <div
              className="coord-marker-image-container"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {imageError ? (
                <div className="coord-image-error">
                  <p>Görsel yüklenemedi</p>
                  <p className="muted">{assetUrl}</p>
                </div>
              ) : (
                <img
                  ref={(el) => setImageRef(el)}
                  src={assetUrl}
                  alt="Koordinat işaretleme"
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                  className="coord-marker-image"
                />
              )}
              {coordinates.map((coord) => (
                <div
                  key={coord.id}
                  className="coord-marker-rectangle"
                  style={{
                    left: `${coord.x}%`,
                    top: `${coord.y}%`,
                    width: `${coord.width}%`,
                    height: `${coord.height}%`,
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    className="coord-rect-edit"
                    onClick={() => {
                      setEditingCoord(coord.id);
                      setCoordOptions(coord.options || ['', '', '', '']);
                      setCorrectAnswer(coord.correctAnswer || 0);
                    }}
                    title="Düzenle"
                  >
                    ✎
                  </button>
                  <button
                    className="coord-rect-delete"
                    onClick={() => removeCoordinate(coord.id)}
                    title="Sil"
                  >
                    ×
                  </button>
                </div>
              ))}
              {currentRect && (
                <div
                  className="coord-marker-rectangle coord-marker-rectangle-preview"
                  style={{
                    left: `${currentRect.x}%`,
                    top: `${currentRect.y}%`,
                    width: `${currentRect.width}%`,
                    height: `${currentRect.height}%`,
                  }}
                />
              )}
            </div>
          </div>
          {editingCoord && (
            <div className="coord-edit-form" id="coord-edit-form">
              <h4>Koordinat Sorusu</h4>
              <div className="field">
                <span>Şık 1</span>
                <input
                  value={coordOptions[0]}
                  onChange={(e) => {
                    const newOptions = [...coordOptions];
                    newOptions[0] = e.target.value;
                    setCoordOptions(newOptions);
                  }}
                  placeholder="Şık 1..."
                />
              </div>
              <div className="field">
                <span>Şık 2</span>
                <input
                  value={coordOptions[1]}
                  onChange={(e) => {
                    const newOptions = [...coordOptions];
                    newOptions[1] = e.target.value;
                    setCoordOptions(newOptions);
                  }}
                  placeholder="Şık 2..."
                />
              </div>
              <div className="field">
                <span>Şık 3</span>
                <input
                  value={coordOptions[2]}
                  onChange={(e) => {
                    const newOptions = [...coordOptions];
                    newOptions[2] = e.target.value;
                    setCoordOptions(newOptions);
                  }}
                  placeholder="Şık 3..."
                />
              </div>
              <div className="field">
                <span>Şık 4</span>
                <input
                  value={coordOptions[3]}
                  onChange={(e) => {
                    const newOptions = [...coordOptions];
                    newOptions[3] = e.target.value;
                    setCoordOptions(newOptions);
                  }}
                  placeholder="Şık 4..."
                />
              </div>
              <div className="field">
                <span>Doğru Cevap (1-4)</span>
                <input
                  type="number"
                  min="1"
                  max="4"
                  value={correctAnswer + 1}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) - 1;
                    if (val >= 0 && val <= 3) {
                      setCorrectAnswer(val);
                    }
                  }}
                />
              </div>
              <div className="coord-edit-actions">
                <button 
                  className="secondary" 
                  onClick={() => {
                    setEditingCoord(null);
                    setCoordOptions(['', '', '', '']);
                    setCorrectAnswer(0);
                  }}
                >
                  İptal
                </button>
                <button 
                  className="primary" 
                  onClick={() => {
                    const updatedCoords = coordinates.map((c) =>
                      c.id === editingCoord
                        ? {
                            ...c,
                            options: coordOptions,
                            correctAnswer: correctAnswer,
                          }
                        : c
                    );
                    setCoordinates(updatedCoords);
                    setEditingCoord(null);
                  }}
                  disabled={!coordOptions[0] || !coordOptions[1] || !coordOptions[2] || !coordOptions[3]}
                >
                  Kaydet
                </button>
              </div>
            </div>
          )}
          <div className="coord-marker-footer">
            <span className="muted">
              {coordinates.length} nokta işaretlendi
            </span>
            <div className="coord-marker-actions">
              <button className="secondary" onClick={onClose}>
                İptal
              </button>
              <button className="primary" onClick={handleSave}>
                Kaydet
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Admin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [firms, setFirms] = useState([]);
  const [firmsLoading, setFirmsLoading] = useState(false);
  const [firmsError, setFirmsError] = useState('');
  const [firmsSuccess, setFirmsSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedFirm, setSelectedFirm] = useState(null);
  const [newFirmName, setNewFirmName] = useState('');
  const [newFirmContact, setNewFirmContact] = useState('');
  const [dangerAssetUrl, setDangerAssetUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageForCoords, setSelectedImageForCoords] = useState(null);
  const [matchSymbolUrl, setMatchSymbolUrl] = useState('');
  const [matchMeaning, setMatchMeaning] = useState('');
  const [allScores, setAllScores] = useState([]);
  const [loadingScores, setLoadingScores] = useState(false);
  const [selectedFirmForScores, setSelectedFirmForScores] = useState('');
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && pathname === '/admin') {
        navigate('/admin/dashboard', { replace: true });
      }
    });
    return unsubscribe;
  }, [navigate, pathname]);

  useEffect(() => {
    if (!user) {
      setFirms([]);
      setSelectedFirm(null);
      return;
    }
    const loadFirms = async () => {
      setFirmsLoading(true);
      setFirmsError('');
      try {
        const snapshot = await getDocs(collection(db, 'firms'));
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setFirms(items);
      } catch (err) {
        setFirmsError(err.message || 'Firmalar alınamadı.');
      } finally {
        setFirmsLoading(false);
      }
    };
    loadFirms();
  }, [user]);

  // Load scores when user is logged in
  useEffect(() => {
    if (!user) {
      setAllScores([]);
      return;
    }
    const loadScores = async () => {
      setLoadingScores(true);
      try {
        const snapshot = await getDocs(collection(db, 'gameScores'));
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Sort by timestamp descending
        items.sort((a, b) => {
          const timeA = a.timestamp?.toDate?.() || new Date(a.createdAt || 0);
          const timeB = b.timestamp?.toDate?.() || new Date(b.createdAt || 0);
          return timeB - timeA;
        });
        setAllScores(items);
      } catch (err) {
        console.error('Skorlar yüklenemedi:', err);
        setAllScores([]);
      } finally {
        setLoadingScores(false);
      }
    };
    loadScores();
  }, [user]);

  useEffect(() => {
    if (activeMenu !== 'games') return;
    if (!selectedFirm && firms.length > 0) {
      const first = firms[0];
      setSelectedFirm({
        ...first,
        games: (first.games || []).map((g) => ({
          ...g,
          assets: g.assets || [],
          pairs: g.pairs || [],
        })),
      });
    }
  }, [activeMenu, firms, selectedFirm]);

  useEffect(() => {
    setDangerAssetUrl('');
    setMatchSymbolUrl('');
    setMatchMeaning('');
  }, [selectedFirm?.id]);

  const isFormValid = useMemo(
    () => email.trim().length > 3 && password.trim().length > 5,
    [email, password]
  );

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!isFormValid || loading) return;
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Giriş başarısız. Bilgileri kontrol edin.');
    } finally {
      setLoading(false);
    }
  };

  const addFirm = async (e) => {
    e.preventDefault();
    if (!newFirmName.trim()) return;
    setFirmsError('');
    const payload = {
      name: newFirmName.trim(),
      contact: newFirmContact.trim(),
      games: [
        { name: 'Tehlike Avı', status: 'Aktif', assets: [] },
        { name: 'Kart Eşleştirme', status: 'Beklemede', pairs: [] },
      ],
      createdAt: serverTimestamp(),
    };
    try {
      const ref = await addDoc(collection(db, 'firms'), payload);
      const newFirm = { id: ref.id, ...payload };
      setFirms((prev) => [...prev, newFirm]);
      setNewFirmName('');
      setNewFirmContact('');
    } catch (err) {
      setFirmsError(err.message || 'Firma eklenemedi.');
    }
  };

  const deleteFirm = async (firmId) => {
    const firm = firms.find((f) => f.id === firmId);
    if (!firm) return;
    
    const confirmMessage = `"${firm.name}" firmasını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    setFirmsError('');
    setFirmsSuccess('');
    
    try {
      await deleteDoc(doc(db, 'firms', firmId));
      
      // Remove from local state
      setFirms((prev) => prev.filter((f) => f.id !== firmId));
      
      // If the deleted firm was selected, reset selection
      if (selectedFirm?.id === firmId) {
        setSelectedFirm(null);
      }
      
      setFirmsSuccess(`"${firm.name}" firması başarıyla silindi.`);
      setTimeout(() => setFirmsSuccess(''), 3000);
    } catch (err) {
      console.error('Firma silme hatası:', err);
      setFirmsError(err.message || 'Firma silinemedi. Lütfen tekrar deneyin.');
    }
  };


  const updateGameStatus = (firmId, gameName, status) => {
    const firmSnapshot =
      firms.find((f) => f.id === firmId) ||
      (selectedFirm?.id === firmId ? selectedFirm : null);
    if (!firmSnapshot) return;
    const newGames = (firmSnapshot.games || []).map((g) =>
      g.name === gameName ? { ...g, status } : g
    );
    if (selectedFirm?.id === firmId) {
      setSelectedFirm((prev) => (prev ? { ...prev, games: newGames } : prev));
    }
    setFirms((prev) =>
      prev.map((firm) => (firm.id === firmId ? { ...firm, games: newGames } : firm))
    );
  };

  const uploadDangerAsset = async (firmId) => {
    if (!dangerAssetUrl.trim()) {
      setFirmsError('Lütfen bir görsel URL girin.');
      return;
    }
    
    // Check if user is authenticated
    if (!user) {
      setFirmsError('Yükleme için giriş yapmanız gerekiyor.');
      return;
    }
    
    setUploadingImage(true);
    setFirmsError('');
    setFirmsSuccess('');

    try {
      const imageUrl = dangerAssetUrl.trim();
      
      if (!imageUrl || !imageUrl.trim()) {
        throw new Error('Geçerli bir görsel URL girin.');
      }

      const firmSnapshot =
        firms.find((f) => f.id === firmId) ||
        (selectedFirm?.id === firmId ? selectedFirm : null);
      if (!firmSnapshot) {
        setFirmsError('Firma bulunamadı.');
        setUploadingImage(false);
        return;
      }

      const newAsset = {
        url: imageUrl,
        coordinates: [],
        id: Date.now().toString(),
      };

      const newGames = (firmSnapshot.games || []).map((g) =>
        (g.name === 'Tehlike Avı')
          ? { ...g, assets: [...(g.assets || []), newAsset] }
          : g
      );

      setDangerAssetUrl('');
      
      if (selectedFirm?.id === firmId) {
        setSelectedFirm((prev) => (prev ? { ...prev, games: newGames } : prev));
      }
      setFirms((prev) =>
        prev.map((firm) => (firm.id === firmId ? { ...firm, games: newGames } : firm))
      );
      
      setFirmsSuccess('Görsel başarıyla eklendi. Değişiklikleri kaydetmek için "Kaydet" butonuna tıklayın.');
      setTimeout(() => setFirmsSuccess(''), 5000);
      console.log('=== Görsel Yükleme Tamamlandı ===');
    } catch (err) {
      console.error('=== Görsel Yükleme Hatası ===');
      console.error('Hata detayı:', err);
      console.error('Hata kodu:', err.code);
      console.error('Hata mesajı:', err.message);
      console.error('Hata stack:', err.stack);
      
      let errorMessage = 'Görsel yüklenemedi. ';
      if (err.code === 'storage/unauthorized') {
        errorMessage += 'Yetki hatası. Firebase Storage kurallarını kontrol edin.';
      } else if (err.code === 'storage/canceled') {
        errorMessage += 'Yükleme iptal edildi.';
      } else if (err.code === 'storage/unknown') {
        errorMessage += 'Bilinmeyen bir hata oluştu.';
      } else if (err.message) {
        errorMessage += err.message;
      } else {
        errorMessage += 'Lütfen tekrar deneyin.';
      }
      
      setFirmsError(errorMessage);
    } finally {
      setUploadingImage(false);
    }
  };

  const addMatchPair = (firmId) => {
    if (!matchSymbolUrl.trim() || !matchMeaning.trim()) return;
    const firmSnapshot =
      firms.find((f) => f.id === firmId) ||
      (selectedFirm?.id === firmId ? selectedFirm : null);
    if (!firmSnapshot) return;
    const newGames = (firmSnapshot.games || []).map((g) =>
      (g.name === 'Kart Eşleştirme')
        ? {
            ...g,
            pairs: [...(g.pairs || []), { symbol: matchSymbolUrl.trim(), meaning: matchMeaning.trim() }],
          }
        : g
    );
    setMatchSymbolUrl('');
    setMatchMeaning('');
    if (selectedFirm?.id === firmId) {
      setSelectedFirm((prev) => (prev ? { ...prev, games: newGames } : prev));
    }
    setFirms((prev) =>
      prev.map((firm) => (firm.id === firmId ? { ...firm, games: newGames } : firm))
    );
  };

  const removeDangerAsset = (firmId, assetUrl) => {
    const firmSnapshot =
      firms.find((f) => f.id === firmId) ||
      (selectedFirm?.id === firmId ? selectedFirm : null);
    if (!firmSnapshot) return;
    const newGames = (firmSnapshot.games || []).map((g) =>
      (g.name === 'Tehlike Avı')
        ? {
            ...g,
            assets: (g.assets || []).filter((asset) => {
              if (typeof asset === 'string') return asset !== assetUrl;
              return asset.url !== assetUrl;
            }),
          }
        : g
    );
    if (selectedFirm?.id === firmId) {
      setSelectedFirm((prev) => (prev ? { ...prev, games: newGames } : prev));
    }
    setFirms((prev) =>
      prev.map((firm) => (firm.id === firmId ? { ...firm, games: newGames } : firm))
    );
  };

  const saveCoordinates = (firmId, assetId, coordinates) => {
    const firmSnapshot =
      firms.find((f) => f.id === firmId) ||
      (selectedFirm?.id === firmId ? selectedFirm : null);
    if (!firmSnapshot) return;
    const newGames = (firmSnapshot.games || []).map((g) =>
      (g.name === 'Tehlike Avı')
        ? {
            ...g,
            assets: (g.assets || []).map((asset) => {
              const assetUrl = typeof asset === 'string' ? asset : asset.url;
              const currentAssetId = typeof asset === 'string' ? assetUrl : asset.id;
              if (currentAssetId === assetId) {
                return typeof asset === 'string'
                  ? { url: asset, coordinates, id: assetUrl }
                  : { ...asset, coordinates };
              }
              return asset;
            }),
          }
        : g
    );
    if (selectedFirm?.id === firmId) {
      setSelectedFirm((prev) => (prev ? { ...prev, games: newGames } : prev));
    }
    setFirms((prev) =>
      prev.map((firm) => (firm.id === firmId ? { ...firm, games: newGames } : firm))
    );
  };

  const removeMatchPair = (firmId, pairIndex) => {
    const firmSnapshot =
      firms.find((f) => f.id === firmId) ||
      (selectedFirm?.id === firmId ? selectedFirm : null);
    if (!firmSnapshot) return;
    const newGames = (firmSnapshot.games || []).map((g) =>
      (g.name === 'Kart Eşleştirme')
        ? { ...g, pairs: (g.pairs || []).filter((_, idx) => idx !== pairIndex) }
        : g
    );
    if (selectedFirm?.id === firmId) {
      setSelectedFirm((prev) => (prev ? { ...prev, games: newGames } : prev));
    }
    setFirms((prev) =>
      prev.map((firm) => (firm.id === firmId ? { ...firm, games: newGames } : firm))
    );
  };

  const saveChanges = async () => {
    if (!selectedFirm || saving) return;
    setFirmsError('');
    setFirmsSuccess('');
    setSaving(true);
    try {
      await updateDoc(doc(db, 'firms', selectedFirm.id), {
        games: selectedFirm.games || [],
      });
      setFirms((prev) =>
        prev.map((firm) =>
          firm.id === selectedFirm.id ? { ...firm, games: selectedFirm.games || [] } : firm
        )
      );
      setFirmsSuccess('Tüm değişiklikler başarıyla kaydedildi.');
      setTimeout(() => setFirmsSuccess(''), 3000);
    } catch (err) {
      setFirmsError(err.message || 'Değişiklikler kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setActiveMenu('dashboard');
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message || 'Çıkış yapılamadı. Tekrar deneyin.');
    }
  };

  if (!user) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="card-header">
            <h1>Admin Girişi</h1>
            <p>Sisteme giriş yapmak için e-posta ve şifrenizi kullanın.</p>
          </div>
          {error ? <div className="alert">{error}</div> : null}
          <form className="form" onSubmit={handleLogin}>
            <label className="field">
              <span>E-posta</span>
              <input
                type="email"
                value={email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ornek.com"
                required
              />
            </label>
            <label className="field">
              <span>Şifre</span>
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                required
              />
            </label>
            <button
              type="submit"
              className="primary"
              disabled={!isFormValid || loading}
            >
              {loading ? 'Giriş yapılıyor...' : 'Giriş yap'}
            </button>
            <Link className="back-link" to="/">
              Ana sayfaya dön
            </Link>
          </form>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeMenu) {
      case 'firms':
        return (
          <div className="firm-layout">
            <div className="firm-list">
              <div className="firm-header">
                <div>
                  <h2>Firmalar</h2>
                  <p>Firmalar ve bağlı oyunları yönetin.</p>
                </div>
                {firmsLoading ? <span className="eyebrow">Yükleniyor...</span> : null}
              </div>
              {firmsError ? <div className="alert">{firmsError}</div> : null}
              <form className="firm-form" onSubmit={addFirm}>
                <div className="field">
                  <span>Firma Adı</span>
                  <input
                    value={newFirmName}
                    onChange={(e) => setNewFirmName(e.target.value)}
                    placeholder="Örn: Atlas Enerji"
                    required
                  />
                </div>
                <div className="field">
                  <span>İletişim (opsiyonel)</span>
                  <input
                    value={newFirmContact}
                    onChange={(e) => setNewFirmContact(e.target.value)}
                    placeholder="iletisim@ornek.com"
                  />
                </div>
                <button className="primary" type="submit" disabled={!newFirmName.trim()}>
                  Firma Ekle
                </button>
              </form>

              <div className="firm-grid">
                {firms.length === 0 ? (
                  <p className="muted">Henüz kayıtlı firma yok.</p>
                ) : (
                  firms.map((firm) => (
                    <div key={firm.id} className="firm-card">
                      <div className="firm-head">
                        <div>
                          <h3>{firm.name}</h3>
                          {firm.contact ? <p className="muted">{firm.contact}</p> : null}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button
                            className="secondary"
                            onClick={() => {
                              setSelectedFirm({
                                ...firm,
                                games: (firm.games || []).map((g) => ({
                                  ...g,
                                  assets: g.assets || [],
                                  pairs: g.pairs || [],
                                })),
                              });
                              setActiveMenu('games');
                              navigate('/admin/games', { replace: true });
                            }}
                          >
                            Oyunları Yönet
                          </button>
                          <button
                            className="delete-btn"
                            onClick={() => deleteFirm(firm.id)}
                            title="Firmayı Sil"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div className="firm-games">
                        {(firm.games || []).map((game) => (
                          <div key={game.name} className="game-pill">
                            <div className="game-pill-info">
                              <span>{game.name}</span>
                              <span className={`status ${game.status?.toLowerCase() || ''}`}>
                                {game.status}
                              </span>
                            </div>
                            <button
                              className="mini-btn"
                              onClick={() => {
                                setSelectedFirm({
                                  ...firm,
                                  games: (firm.games || []).map((g) => ({
                                    ...g,
                                    assets: g.assets || [],
                                    pairs: g.pairs || [],
                                  })),
                                });
                                setActiveMenu('games');
                                navigate('/admin/games', { replace: true });
                              }}
                            >
                              Yönet
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {selectedFirm ? (
              <div className="firm-manage">
                <div className="firm-manage-head">
                  <div>
                    <p className="eyebrow">Seçili Firma</p>
                    <h3>{selectedFirm.name}</h3>
                    {selectedFirm.contact ? (
                      <p className="muted">{selectedFirm.contact}</p>
                    ) : null}
                  </div>
                  <button
                    className="secondary"
                    onClick={() => {
                      setSelectedFirm(null);
                    }}
                  >
                    Kapat
                  </button>
                </div>
                {firmsSuccess ? (
                  <div className="success">{firmsSuccess}</div>
                ) : null}
                {firmsError ? <div className="alert">{firmsError}</div> : null}
                <div className="firm-manage-actions-row">
                  <button
                    className="primary"
                    onClick={saveChanges}
                    disabled={saving}
                  >
                    {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                  </button>
                </div>
                <div className="firm-games-manage">
                  {(selectedFirm.games || []).map((game) => (
                    <div key={game.name} className="game-manage-row">
                      <div className="game-manage-top">
                        <div>
                          <p className="strong">{game.name}</p>
                          <p className="muted">Durum: {game.status}</p>
                        </div>
                        <select
                          value={game.status}
                          onChange={(e) =>
                            updateGameStatus(selectedFirm.id, game.name, e.target.value)
                          }
                        >
                          <option value="Aktif">Aktif</option>
                          <option value="Beklemede">Beklemede</option>
                          <option value="Pasif">Pasif</option>
                        </select>
                      </div>

                      {(game.name === 'Tehlike Avı') ? (
                        <div className="game-manage-actions">
                          <div className="field">
                            <span>Görsel URL</span>
                            <input
                              value={dangerAssetUrl}
                              onChange={(e) => setDangerAssetUrl(e.target.value)}
                              placeholder="https://..."
                            />
                          </div>
                          <button
                            className="mini-btn"
                            onClick={() => uploadDangerAsset(selectedFirm.id)}
                            disabled={!dangerAssetUrl.trim() || uploadingImage}
                          >
                            {uploadingImage ? 'Yükleniyor...' : 'Ekle'}
                          </button>
                        </div>
                      ) : null}

                      {(game.name === 'Kart Eşleştirme') ? (
                        <div className="game-manage-actions">
                          <div className="field">
                            <span>İş sağlığı sembolü (görsel URL)</span>
                            <input
                              value={matchSymbolUrl}
                              onChange={(e) => setMatchSymbolUrl(e.target.value)}
                              placeholder="https://..."
                            />
                          </div>
                          <div className="field">
                            <span>Anlam / açıklama</span>
                            <input
                              value={matchMeaning}
                              onChange={(e) => setMatchMeaning(e.target.value)}
                              placeholder="Örn: Kimyasal koruyucu eldiven kullan"
                            />
                          </div>
                          <button
                            className="mini-btn"
                            onClick={() => addMatchPair(selectedFirm.id)}
                            disabled={!matchSymbolUrl.trim() || !matchMeaning.trim()}
                          >
                            Ekle
                          </button>
                        </div>
                      ) : null}

                      {(game.name === 'Tehlike Avı') && (game.assets || []).length ? (
                        <div className="asset-list">
                          {(game.assets || []).map((asset, idx) => {
                            const assetUrl = typeof asset === 'string' ? asset : asset.url;
                            const assetId = typeof asset === 'string' ? asset : asset.id;
                            const coordinates = typeof asset === 'string' ? [] : (asset.coordinates || []);
                            return (
                              <div key={assetId || assetUrl} className="asset-item">
                                <div className="asset-preview">
                                  <img
                                    src={assetUrl}
                                    alt="Tehlike Avı görseli"
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                      const fallback = e.target.nextElementSibling;
                                      if (fallback) fallback.style.display = 'block';
                                    }}
                                  />
                                  <div className="asset-image-fallback" style={{ display: 'none' }}>
                                    Görsel yüklenemedi
                                  </div>
                                  <div className="asset-info">
                                    <span className="muted">
                                      {coordinates.length} koordinat işaretli
                                    </span>
                                  </div>
                                </div>
                                <div className="asset-actions">
                                  <button
                                    className="secondary mini-btn"
                                    onClick={() => setSelectedImageForCoords({ asset, firmId: selectedFirm.id, gameIndex: idx })}
                                    title="Koordinat İşaretle"
                                  >
                                    Koordinat İşaretle
                                  </button>
                                  <button
                                    className="delete-btn"
                                    onClick={() => removeDangerAsset(selectedFirm.id, assetUrl)}
                                    title="Sil"
                                  >
                                    ×
                                  </button>
                                </div>
    </div>
  );
                          })}
                        </div>
                      ) : null}

                      {(game.name === 'Kart Eşleştirme') && (game.pairs || []).length ? (
                        <div className="pair-list">
                          {(game.pairs || []).map((pair, idx) => (
                            <div key={`${pair.symbol}-${idx}`} className="pair-item">
                              <div className="pair-symbol">
                                <img
                                  src={pair.symbol}
                                  alt="İş sağlığı sembolü"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    const fallback = e.target.parentElement.querySelector('.img-fallback');
                                    if (fallback) fallback.style.display = 'block';
                                  }}
                                />
                                <span className="img-fallback" style={{ display: 'none', fontSize: '11px', color: '#9fb3c8' }}>
                                  Görsel yüklenemedi
                                </span>
                              </div>
                              <span className="muted">{pair.meaning}</span>
                              <button
                                className="delete-btn"
                                onClick={() => removeMatchPair(selectedFirm.id, idx)}
                                title="Sil"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      case 'games':
        return (
          <div className="games-manage">
            <div className="games-head">
              <div>
                <h2>Oyun Yönetimi</h2>
                <p>Firmalara bağlı oyunları tek ekranda yönetin.</p>
              </div>
              <select
                value={selectedFirm?.id || ''}
                onChange={(e) => {
                  const found = firms.find((f) => f.id === e.target.value);
                  if (found) {
                    setSelectedFirm({
                      ...found,
                      games: (found.games || []).map((g) => ({
                        ...g,
                        assets: g.assets || [],
                        pairs: g.pairs || [],
                      })),
                    });
                  }
                }}
              >
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            {firmsSuccess ? (
              <div className="success">{firmsSuccess}</div>
            ) : null}
            {firmsError ? <div className="alert">{firmsError}</div> : null}
            {!selectedFirm ? (
              <p className="muted">Önce bir firma ekleyin ya da seçin.</p>
            ) : (
              <div className="game-manage-stack">
                {(selectedFirm.games || []).map((game) => (
                  <div key={game.name} className="game-card-manage">
                    <div className="game-manage-top">
                      <div>
                        <p className="strong">{game.name}</p>
                        <p className="muted">Durum: {game.status}</p>
                      </div>
                      <select
                        value={game.status}
                        onChange={(e) =>
                          updateGameStatus(selectedFirm.id, game.name, e.target.value)
                        }
                      >
                        <option value="Aktif">Aktif</option>
                        <option value="Beklemede">Beklemede</option>
                        <option value="Pasif">Pasif</option>
                      </select>
                    </div>

                    {(game.name === 'Tehlike Avı') ? (
                      <div className="game-manage-actions">
                        <div className="field">
                          <span>Görsel URL</span>
                          <input
                            value={dangerAssetUrl}
                            onChange={(e) => setDangerAssetUrl(e.target.value)}
                            placeholder="https://..."
                          />
                        </div>
                        <button
                          className="mini-btn"
                          onClick={() => uploadDangerAsset(selectedFirm.id)}
                          disabled={!dangerAssetUrl.trim() || uploadingImage}
                        >
                          {uploadingImage ? 'Yükleniyor...' : 'Ekle'}
                        </button>
                      </div>
                    ) : null}

                    {game.name === 'Kart Eşleştirme' ? (
                      <div className="game-manage-actions game-manage-actions-2">
                        <div className="field">
                          <span>İş sağlığı sembolü (görsel URL)</span>
                          <input
                            value={matchSymbolUrl}
                            onChange={(e) => setMatchSymbolUrl(e.target.value)}
                            placeholder="https://..."
                          />
                        </div>
                        <div className="field">
                          <span>Anlam / açıklama</span>
                          <input
                            value={matchMeaning}
                            onChange={(e) => setMatchMeaning(e.target.value)}
                            placeholder="Örn: Kimyasal koruyucu eldiven kullan"
                          />
                        </div>
                        <button
                          className="mini-btn"
                          onClick={() => addMatchPair(selectedFirm.id)}
                          disabled={!matchSymbolUrl.trim() || !matchMeaning.trim()}
                        >
                          Ekle
                        </button>
                      </div>
                    ) : null}

                    {game.name === 'Tehlike Avı' && (game.assets || []).length ? (
                      <div className="asset-list">
                        {(game.assets || []).map((asset, idx) => {
                          const assetUrl = typeof asset === 'string' ? asset : asset.url;
                          const assetId = typeof asset === 'string' ? asset : asset.id;
                          const coordinates = typeof asset === 'string' ? [] : (asset.coordinates || []);
                          return (
                            <div key={assetId || assetUrl} className="asset-item">
                              <div className="asset-preview">
                                <img
                                  src={assetUrl}
                                  alt="Tehlike Avı görseli"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    const fallback = e.target.nextElementSibling;
                                    if (fallback) fallback.style.display = 'block';
                                  }}
                                />
                                <div className="asset-image-fallback" style={{ display: 'none' }}>
                                  Görsel yüklenemedi
                                </div>
                                <div className="asset-info">
                                  <span className="muted">
                                    {coordinates.length} koordinat işaretli
                                  </span>
                                </div>
                              </div>
                              <div className="asset-actions">
                                <button
                                  className="secondary mini-btn"
                                  onClick={() => setSelectedImageForCoords({ asset, firmId: selectedFirm.id, gameIndex: idx })}
                                  title="Koordinat İşaretle"
                                >
                                  Koordinat İşaretle
                                </button>
                                <button
                                  className="delete-btn"
                                  onClick={() => removeDangerAsset(selectedFirm.id, assetUrl)}
                                  title="Sil"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {game.name === 'Kart Eşleştirme' && (game.pairs || []).length ? (
                      <div className="pair-list">
                        {(game.pairs || []).map((pair, idx) => (
                          <div key={`${pair.symbol}-${idx}`} className="pair-item">
                            <div className="pair-symbol">
                              <img
                                src={pair.symbol}
                                alt="İş sağlığı sembolü"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  const fallback = e.target.parentElement.querySelector('.img-fallback');
                                  if (fallback) fallback.style.display = 'block';
                                }}
                              />
                              <span className="img-fallback" style={{ display: 'none', fontSize: '11px', color: '#9fb3c8' }}>
                                Görsel yüklenemedi
                              </span>
                            </div>
                            <span className="muted">{pair.meaning}</span>
                            <button
                              className="delete-btn"
                              onClick={() => removeMatchPair(selectedFirm.id, idx)}
                              title="Sil"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="game-save-row">
                      <button
                        className="primary"
                        onClick={saveChanges}
                        disabled={saving}
                      >
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'settings':
        return (
          <div>
            <h2>Ayarlar</h2>
            <p>Sistem yapılandırmaları ve genel tercihleri düzenleyin.</p>
          </div>
        );
      case 'management':
        const filteredScores = selectedFirmForScores
          ? allScores.filter((score) => {
              const scoreFirmName = (score.firmName || '').toLowerCase().trim();
              const selectedFirmName = selectedFirmForScores.toLowerCase().trim();
              return scoreFirmName === selectedFirmName;
            })
          : allScores;
        
        return (
          <div>
            <h2>Skor Listesi</h2>
            <p>Tüm şirketlerin oyun skorlarını görüntüleyin ve yönetin.</p>
            
            <div className="field" style={{ marginBottom: '20px', maxWidth: '400px' }}>
              <span>Firma Filtrele</span>
              <select
                value={selectedFirmForScores}
                onChange={(e) => setSelectedFirmForScores(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">Tüm Firmalar</option>
                {firms.map((firm) => (
                  <option key={firm.id} value={firm.name}>
                    {firm.name}
                  </option>
                ))}
              </select>
            </div>

            {loadingScores ? (
              <p className="muted">Yükleniyor...</p>
            ) : filteredScores.length === 0 ? (
              <p className="muted">Henüz skor kaydı bulunmuyor.</p>
            ) : (
              <div className="scores-table">
                <table>
                  <thead>
                    <tr>
                      <th>Oyuncu ID</th>
                      <th>Firma</th>
                      <th>Oyun</th>
                      <th>Skor</th>
                      <th>Tarih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredScores.map((score) => {
                      const scoreDate = score.timestamp?.toDate?.() || new Date(score.createdAt || Date.now());
                      return (
                        <tr key={score.id}>
                          <td>{score.playerId}</td>
                          <td>{score.firmName}</td>
                          <td>{score.gameName}</td>
                          <td>
                            <span className={`score-value ${score.score >= 70 ? 'score-good' : score.score >= 40 ? 'score-medium' : 'score-low'}`}>
                              {score.score}
                            </span>
                          </td>
                          <td>{scoreDate.toLocaleString('tr-TR')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      default:
        return (
          <div>
            <h2>Kontrol Paneli</h2>
            <p>Özet veriler ve hızlı aksiyonlar.</p>
            <div className="grid">
              <div className="info-card">
                <strong>Toplam Firma</strong>
                <span>42</span>
              </div>
              <div className="info-card">
                <strong>Aktif Oyun</strong>
                <span>7</span>
              </div>
              <div className="info-card">
                <strong>Bekleyen İşlem</strong>
                <span>5</span>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" />
          <div>
            <p className="brand-title">Yönetim</p>
            <p className="brand-sub">ISG Yarışması</p>
          </div>
        </div>
        <div className="user-chip">
          <span className="avatar">{user.email?.[0]?.toUpperCase()}</span>
          <div>
            <p className="eyebrow">Bağlı</p>
            <p className="user-email">{user.email}</p>
          </div>
        </div>
        <nav className="menu">
          {menuItems.map((item) => (
            <button
              key={item.key}
              className={`menu-item ${activeMenu === item.key ? 'active' : ''}`}
              onClick={() => {
                setActiveMenu(item.key);
                if (item.key === 'dashboard') {
                  navigate('/admin/dashboard', { replace: true });
                } else {
                  navigate(`/admin/${item.key}`, { replace: true });
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="secondary full" onClick={handleLogout}>
            Çıkış Yap
          </button>
        </div>
      </aside>
      <main className="content">{renderContent()}</main>
      {selectedImageForCoords && (
        <CoordinateMarker
          imageData={selectedImageForCoords}
          onSave={(coords) =>
            saveCoordinates(
              selectedImageForCoords.firmId,
              typeof selectedImageForCoords.asset === 'string'
                ? selectedImageForCoords.asset
                : selectedImageForCoords.asset.id,
              coords
            )
          }
          onClose={() => setSelectedImageForCoords(null)}
        />
      )}
    </div>
  );
}

function App() {
  const [playerId, setPlayerId] = useState('');
  const [firmName, setFirmName] = useState('');
  const navigate = useNavigate();

  const handlePlayerLogin = (id, firm) => {
    setPlayerId(id);
    setFirmName(firm);
  };

  const handlePlayerLogout = () => {
    setPlayerId('');
    setFirmName('');
    navigate('/', { replace: true });
  };

  return (
    <Routes>
      <Route
        path="/"
        element={<PlayerLogin playerId={playerId} firmName={firmName} onLogin={handlePlayerLogin} />}
      />
      <Route
        path="/oyun"
        element={<GameHub playerId={playerId} firmName={firmName} onLogout={handlePlayerLogout} />}
      />
      <Route
        path="/oyun/tehlike-avi"
        element={
          <TehlikeAviPlay
            playerId={playerId}
            firmName={firmName}
            onBack={() => navigate('/oyun', { replace: true })}
          />
        }
      />
      <Route
        path="/oyun/kart-eslestirme"
        element={
          <KartEslestirmePlay
            playerId={playerId}
            firmName={firmName}
            onBack={() => navigate('/oyun', { replace: true })}
          />
        }
      />
      <Route path="/admin" element={<Admin />} />
      <Route path="/admin/:section" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
