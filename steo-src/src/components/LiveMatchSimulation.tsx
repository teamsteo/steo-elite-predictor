'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { LiveFootballMatch, MatchEvent, BallPosition } from '@/lib/footballLiveService';

// ============================================
// PROPS
// ============================================

interface LiveMatchSimulationProps {
  match: LiveFootballMatch;
  compact?: boolean;
  onGoal?: (team: 'home' | 'away') => void;
}

// ============================================
// CONSTANTES
// ============================================

const FIELD_WIDTH = 300;
const FIELD_HEIGHT = 200;
const PLAYER_SIZE = 8;
const BALL_SIZE = 6;

// Sons (base64 court pour but)
const GOAL_SOUND = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNFCCtAAAAAAD/+1DEAAAFoANoAAAAACKgA1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7UMQeAAi0A2gAAAAAAACAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+1DEQAAAAAH/AAAAAAAANIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

// ============================================
// COMPOSANT PRINCIPAL
// ============================================

export default function LiveMatchSimulation({ match, compact = false, onGoal }: LiveMatchSimulationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const [ballPos, setBallPos] = useState({ x: 50, y: 50 });
  const [animating, setAnimating] = useState(false);
  const [celebration, setCelebration] = useState(false);
  const [flashCard, setFlashCard] = useState<'home' | 'away' | null>(null);
  const lastScoreRef = useRef(match.score);
  const lastEventsRef = useRef(match.events.length);

  // Jouer le son de but
  const playGoalSound = useCallback(() => {
    try {
      const audio = new Audio(GOAL_SOUND);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {
      // Ignore audio errors
    }
  }, []);

  // Détecter les nouveaux buts
  useEffect(() => {
    const prevScore = lastScoreRef.current;
    const currentScore = match.score;

    if (currentScore.home > prevScore.home) {
      // But domicile
      playGoalSound();
      setCelebration(true);
      onGoal?.('home');
      setTimeout(() => setCelebration(false), 3000);
    } else if (currentScore.away > prevScore.away) {
      // But extérieur
      playGoalSound();
      setCelebration(true);
      onGoal?.('away');
      setTimeout(() => setCelebration(false), 3000);
    }

    lastScoreRef.current = { ...currentScore };
  }, [match.score, playGoalSound, onGoal]);

  // Détecter les nouveaux cartons rouges
  useEffect(() => {
    const prevEvents = lastEventsRef.current;
    const currentEvents = match.events;

    if (currentEvents.length > prevEvents) {
      const newEvents = currentEvents.slice(prevEvents);
      const redCard = newEvents.find(e => e.type === 'red_card');
      if (redCard) {
        setFlashCard(redCard.team);
        setTimeout(() => setFlashCard(null), 2000);
      }
    }

    lastEventsRef.current = currentEvents.length;
  }, [match.events]);

  // Animation du ballon
  useEffect(() => {
    const targetX = match.ballPosition.x * (FIELD_WIDTH / 100);
    const targetY = match.ballPosition.y * (FIELD_HEIGHT / 100);

    let currentX = ballPos.x;
    let currentY = ballPos.y;

    const animate = () => {
      const dx = targetX - currentX;
      const dy = targetY - currentY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 1) {
        currentX += dx * 0.05;
        currentY += dy * 0.05;
        setBallPos({ x: currentX, y: currentY });
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setAnimating(false);
      }
    };

    if (!animating) {
      setAnimating(true);
      animate();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [match.ballPosition]);

  // Dessiner le terrain
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = compact ? 200 : FIELD_WIDTH;
    const height = compact ? 130 : FIELD_HEIGHT;

    // Clear
    ctx.fillStyle = '#1a472a';
    ctx.fillRect(0, 0, width, height);

    // Lignes du terrain
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;

    // Bordures
    ctx.strokeRect(5, 5, width - 10, height - 10);

    // Ligne médiane
    ctx.beginPath();
    ctx.moveTo(width / 2, 5);
    ctx.lineTo(width / 2, height - 5);
    ctx.stroke();

    // Cercle central
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 25, 0, Math.PI * 2);
    ctx.stroke();

    // Surfaces de réparation
    const penaltyWidth = 40;
    const penaltyHeight = 70;
    const goalAreaWidth = 15;
    const goalAreaHeight = 35;

    // Surface domicile (gauche)
    ctx.strokeRect(5, (height - penaltyHeight) / 2, penaltyWidth, penaltyHeight);
    ctx.strokeRect(5, (height - goalAreaHeight) / 2, goalAreaWidth, goalAreaHeight);

    // Surface extérieur (droite)
    ctx.strokeRect(width - 5 - penaltyWidth, (height - penaltyHeight) / 2, penaltyWidth, penaltyHeight);
    ctx.strokeRect(width - 5 - goalAreaWidth, (height - goalAreaHeight) / 2, goalAreaWidth, goalAreaHeight);

    // Points de penalty
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(30, height / 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width - 30, height / 2, 2, 0, Math.PI * 2);
    ctx.fill();

    // Dessiner les joueurs (positions approximatives)
    drawPlayers(ctx, match, width, height, compact);

    // Dessiner le ballon
    drawBall(ctx, ballPos.x * (width / FIELD_WIDTH), ballPos.y * (height / FIELD_HEIGHT), celebration);

    // Effet flash pour carton rouge
    if (flashCard) {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
      ctx.fillRect(0, 0, width, height);
    }

    // Effet célébration
    if (celebration) {
      drawCelebration(ctx, width, height);
    }

  }, [ballPos, match, compact, celebration, flashCard]);

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={compact ? 200 : FIELD_WIDTH}
        height={compact ? 130 : FIELD_HEIGHT}
        style={{
          borderRadius: '8px',
          border: '2px solid #2d5a3d',
          display: 'block'
        }}
      />

      {/* Minute en superposition */}
      <div style={{
        position: 'absolute',
        top: '8px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0, 0, 0, 0.7)',
        color: match.status === 'live' ? '#22c55e' : '#fff',
        padding: '2px 10px',
        borderRadius: '12px',
        fontSize: compact ? '10px' : '12px',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }}>
        {match.status === 'live' && (
          <span style={{
            width: '6px',
            height: '6px',
            background: '#22c55e',
            borderRadius: '50%',
            animation: 'pulse 1s infinite'
          }} />
        )}
        {match.time.display}
      </div>

      {/* Animation célébration overlay */}
      {celebration && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: compact ? '24px' : '36px',
          fontWeight: 'bold',
          color: '#ffd700',
          textShadow: '0 0 10px rgba(255, 215, 0, 0.8)',
          animation: 'pulse 0.5s ease-in-out infinite',
          zIndex: 10
        }}>
          ⚽ GOAL!
        </div>
      )}
    </div>
  );
}

// ============================================
// FONCTIONS DE DESSIN
// ============================================

function drawPlayers(
  ctx: CanvasRenderingContext2D,
  match: LiveFootballMatch,
  width: number,
  height: number,
  compact: boolean
) {
  const playerSize = compact ? 5 : PLAYER_SIZE;

  // Positions approximatives des joueurs (4-3-3)
  const homePositions = [
    // Gardien
    { x: 8, y: 50 },
    // Défenseurs
    { x: 20, y: 20 }, { x: 20, y: 40 }, { x: 20, y: 60 }, { x: 20, y: 80 },
    // Milieux
    { x: 35, y: 30 }, { x: 35, y: 50 }, { x: 35, y: 70 },
    // Attaquants
    { x: 48, y: 25 }, { x: 48, y: 50 }, { x: 48, y: 75 },
  ];

  const awayPositions = [
    // Gardien
    { x: 92, y: 50 },
    // Défenseurs
    { x: 80, y: 20 }, { x: 80, y: 40 }, { x: 80, y: 60 }, { x: 80, y: 80 },
    // Milieux
    { x: 65, y: 30 }, { x: 65, y: 50 }, { x: 65, y: 70 },
    // Attaquants
    { x: 52, y: 25 }, { x: 52, y: 50 }, { x: 52, y: 75 },
  ];

  // Ajuster les positions selon la possession
  const possessionFactor = (match.stats.possession.home - 50) / 100;
  homePositions.forEach(p => p.x += possessionFactor * 5);
  awayPositions.forEach(p => p.x -= possessionFactor * 5);

  // Dessiner joueurs domicile
  ctx.fillStyle = match.homeTeam.color;
  homePositions.forEach(pos => {
    const x = (pos.x / 100) * width;
    const y = (pos.y / 100) * height;
    ctx.beginPath();
    ctx.arc(x, y, playerSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Dessiner joueurs extérieur
  ctx.fillStyle = match.awayTeam.color;
  awayPositions.forEach(pos => {
    const x = (pos.x / 100) * width;
    const y = (pos.y / 100) * height;
    ctx.beginPath();
    ctx.arc(x, y, playerSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  celebrating: boolean
) {
  // Ombre
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 4, BALL_SIZE, BALL_SIZE / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ballon
  if (celebrating) {
    // Ballon doré pendant célébration
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 15;
  } else {
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  ctx.beginPath();
  ctx.arc(x, y, BALL_SIZE, 0, Math.PI * 2);
  ctx.fill();

  // Motif du ballon (pentagones)
  if (!celebrating) {
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(x, y, BALL_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
}

function drawCelebration(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  // Confettis
  const colors = ['#ff0000', '#ffff00', '#00ff00', '#0088ff', '#ff00ff'];
  
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = 2 + Math.random() * 4;

    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
  }
}
