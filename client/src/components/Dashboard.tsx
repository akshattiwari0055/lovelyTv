import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCheck,
  Flame,
  Home,
  ImagePlus,
  Lock,
  Menu,
  MessageCircle,
  Phone,
  Search,
  Send,
  ShieldBan,
  UserCircle2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";
import { AppNotification, BlockedUserEntry, FriendRequest, Message, User } from "../types";
import { VideoRoom } from "./VideoRoom";

function getConversationRoom(userA: string, userB: string) {
  const [first, second] = [userA, userB].sort();
  return `call-${first}-${second}`;
}

type DashboardProps = { token: string; user: User; onLogout: () => void };
type AppTab = "home" | "discover" | "chat" | "profile";
// Mobile sub-views for chat: list = thread list, convo = open conversation
type ChatView = "list" | "convo";

// ─── GLOBAL STYLES injected once ─────────────────────────────────────────────
const GLOBAL_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }

  /* ── SHELL ─────────────────────────────────────────────────────────────── */
  .ds-shell {
    display: flex;
    width: 100vw;
    height: 100dvh;
    overflow: hidden;           /* THE key fix — nothing overflows the viewport */
    background: #0a0f1c;
    color: #e8eaf0;
    font-family: 'Segoe UI', system-ui, sans-serif;
  }

  /* ── DESKTOP SIDEBAR ────────────────────────────────────────────────────── */
  .ds-sidebar {
    width: 220px;
    flex-shrink: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: rgba(0,0,0,0.35);
    border-right: 1px solid rgba(255,255,255,0.06);
    overflow: hidden;
  }
  .ds-brand {
    display: flex; align-items: center; gap: 11px;
    padding: 20px 16px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    flex-shrink: 0;
  }
  .ds-brand-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: linear-gradient(135deg, #ffb84a, #ff8c42);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.9rem; font-weight: 800; color: #1a0e00; flex-shrink: 0;
  }
  .ds-brand-name { font-size: 0.9rem; font-weight: 700; color: #fff; }
  .ds-brand-sub { font-size: 0.72rem; color: rgba(255,255,255,0.4); margin-top: 1px; }
  .ds-side-section { padding: 14px 10px 6px; flex: 1; overflow-y: auto; }
  .ds-side-label {
    font-size: 0.65rem; font-weight: 700; letter-spacing: 0.1em;
    color: rgba(255,255,255,0.3); padding: 0 6px; margin-bottom: 6px;
    text-transform: uppercase;
  }
  .ds-side-chip {
    display: flex; align-items: center; gap: 9px;
    padding: 8px 8px; border-radius: 10px; cursor: pointer;
    width: 100%; text-align: left; background: transparent; border: none;
    transition: background 0.14s; color: rgba(255,255,255,0.65);
  }
  .ds-side-chip:hover { background: rgba(255,255,255,0.06); }
  .ds-side-chip.active { background: rgba(255,184,74,0.1); color: #ffb84a; }
  .ds-side-chip-av {
    width: 30px; height: 30px; border-radius: 50%;
    background: linear-gradient(135deg, #4ee1b7, #1b8a6b);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.75rem; font-weight: 800; color: #fff; flex-shrink: 0;
  }
  .ds-side-chip-name { font-size: 0.82rem; font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ds-unread-pill {
    background: #ffb84a; color: #1a0e00;
    font-size: 0.65rem; font-weight: 800;
    padding: 2px 6px; border-radius: 100px; flex-shrink: 0;
  }
  .ds-side-empty { font-size: 0.78rem; color: rgba(255,255,255,0.25); padding: 6px 8px; }

  /* ── CONTENT SHELL ──────────────────────────────────────────────────────── */
  .ds-content {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── TOPBAR ─────────────────────────────────────────────────────────────── */
  .ds-topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 18px;
    height: 56px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: rgba(0,0,0,0.2);
  }
  .ds-topbar-left { display: flex; align-items: center; gap: 10px; }
  .ds-topbar-title { font-size: 0.98rem; font-weight: 700; color: #fff; }
  .ds-icon-btn {
    width: 34px; height: 34px; border-radius: 9px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,0.6); cursor: pointer;
    transition: background 0.14s, color 0.14s; flex-shrink: 0;
  }
  .ds-icon-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
  .ds-topbar-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    background: linear-gradient(135deg, #ffb84a, #ff8c42);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.8rem; font-weight: 800; color: #1a0e00; cursor: pointer;
    border: 2px solid rgba(255,184,74,0.3);
  }

  /* ── MAIN SCROLL AREA ───────────────────────────────────────────────────── */
  .ds-main {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;         /* prevent horizontal scroll */
    padding: 20px 20px 8px;
    min-height: 0;
  }
  .ds-main.no-pad { padding: 0; }

  /* ── BOTTOM NAV ─────────────────────────────────────────────────────────── */
  .ds-bottom-nav {
    display: none;
    flex-shrink: 0;
    height: 64px;
    background: rgba(0,0,0,0.5);
    border-top: 1px solid rgba(255,255,255,0.07);
    backdrop-filter: blur(16px);
  }
  .ds-nav-item {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 3px;
    background: none; border: none; cursor: pointer;
    color: rgba(255,255,255,0.4); font-size: 0.68rem; font-weight: 600;
    position: relative; transition: color 0.15s;
  }
  .ds-nav-item.active { color: #ffb84a; }
  .ds-nav-badge {
    position: absolute; top: 4px; right: calc(50% - 16px);
    background: #ff5050; color: #fff;
    font-size: 0.6rem; font-weight: 800;
    padding: 1px 5px; border-radius: 100px; min-width: 16px; text-align: center;
  }

  /* ── HERO CARD ──────────────────────────────────────────────────────────── */
  .hero-card {
    position: relative; overflow: hidden;
    background: linear-gradient(135deg, #0d2137 0%, #0a1628 55%, #111a2e 100%);
    border: 1px solid rgba(255,184,74,0.2);
    border-radius: 20px;
    padding: 36px 32px;
    margin-bottom: 24px;
    min-height: 240px;
    display: flex; flex-direction: column; justify-content: center;
    flex-shrink: 0;
  }
  .hero-glow {
    position: absolute; top: -80px; right: -80px;
    width: 300px; height: 300px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,184,74,0.13) 0%, transparent 70%);
    pointer-events: none;
  }
  .hero-glow2 {
    position: absolute; bottom: -80px; left: -40px;
    width: 240px; height: 240px; border-radius: 50%;
    background: radial-gradient(circle, rgba(30,120,220,0.09) 0%, transparent 70%);
    pointer-events: none;
  }
  .hero-inner { position: relative; z-index: 1; }
  .hero-badge {
    display: inline-flex; align-items: center; gap: 7px;
    background: rgba(255,184,74,0.12); border: 1px solid rgba(255,184,74,0.3);
    border-radius: 100px; padding: 5px 14px;
    font-size: 0.68rem; font-weight: 700; letter-spacing: 0.1em; color: #ffb84a;
    margin-bottom: 18px;
  }
  .hero-dot {
    width: 7px; height: 7px; border-radius: 50%; background: #ffb84a;
    animation: blink 1.4s infinite;
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
  .hero-title {
    font-size: clamp(1.55rem, 3.5vw, 2.1rem); font-weight: 800;
    line-height: 1.2; color: #fff; margin: 0 0 10px; letter-spacing: -0.02em;
  }
  .hero-accent {
    background: linear-gradient(90deg, #ffb84a, #ff8c42);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  }
  .hero-sub { font-size: 0.86rem; color: rgba(255,255,255,0.42); margin: 0 0 24px; }
  .hero-cta {
    display: inline-flex; align-items: center; gap: 9px;
    background: linear-gradient(135deg, #ffb84a, #ff8c42);
    color: #1a0e00; font-weight: 700; font-size: 0.93rem;
    padding: 13px 26px; border-radius: 100px; border: none; cursor: pointer;
    box-shadow: 0 4px 20px rgba(255,140,66,0.35);
    transition: transform 0.17s, box-shadow 0.17s; white-space: nowrap;
  }
  .hero-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(255,140,66,0.5); }

  /* ── HOME SECTIONS ──────────────────────────────────────────────────────── */
  .sec { margin-bottom: 26px; }
  .sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; }
  .sec-title { font-size: 0.97rem; font-weight: 700; color: #fff; margin: 0; }
  .sec-link { font-size: 0.8rem; font-weight: 600; color: #ffb84a; background: none; border: none; cursor: pointer; padding: 0; }
  .sec-link:hover { opacity: 0.7; }
  .sec-empty {
    background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.1);
    border-radius: 14px; padding: 18px; color: rgba(255,255,255,0.35);
    font-size: 0.85rem; text-align: center;
  }

  /* ── SUGGESTED GRID ─────────────────────────────────────────────────────── */
  .sug-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 11px; }
  .sug-card {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px; padding: 18px 13px 14px;
    display: flex; flex-direction: column; align-items: center; gap: 7px; text-align: center;
    transition: background 0.16s, border-color 0.16s;
  }
  .sug-card:hover { background: rgba(255,255,255,0.07); border-color: rgba(255,184,74,0.25); }
  .sug-av {
    width: 50px; height: 50px; border-radius: 50%;
    background: linear-gradient(135deg, #ffb84a, #ff8c42);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.25rem; font-weight: 800; color: #1a0e00;
  }
  .sug-name { font-size: 0.85rem; font-weight: 700; color: #fff; }
  .sug-sub { font-size: 0.72rem; color: rgba(255,255,255,0.4); }
  .conn-btn {
    display: inline-flex; align-items: center; gap: 5px;
    background: rgba(255,184,74,0.1); border: 1px solid rgba(255,184,74,0.28);
    border-radius: 100px; padding: 6px 13px;
    font-size: 0.74rem; font-weight: 600; color: #ffb84a;
    cursor: pointer; margin-top: 3px; transition: background 0.14s;
  }
  .conn-btn:hover { background: rgba(255,184,74,0.2); }

  /* ── FRIEND ROW ─────────────────────────────────────────────────────────── */
  .friend-rows { display: flex; flex-direction: column; gap: 7px; }
  .f-row {
    display: flex; align-items: center; gap: 12px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 13px; padding: 11px 15px;
    cursor: pointer; text-align: left; width: 100%; border: 1px solid rgba(255,255,255,0.07);
    transition: background 0.14s, border-color 0.14s;
  }
  .f-row:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,184,74,0.2); }
  .f-av {
    width: 40px; height: 40px; border-radius: 50%;
    background: linear-gradient(135deg, #4ee1b7, #1b8a6b);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.95rem; font-weight: 800; color: #fff; flex-shrink: 0;
  }
  .f-info { flex: 1; min-width: 0; }
  .f-name { font-size: 0.88rem; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .f-sub { font-size: 0.74rem; color: rgba(255,255,255,0.38); }
  .f-unread { width: 9px; height: 9px; border-radius: 50%; background: #ffb84a; flex-shrink: 0; }
  .f-unread-pill {
    background: #ffb84a; color: #1a0e00;
    font-size: 0.68rem; font-weight: 800;
    padding: 2px 7px; border-radius: 100px; flex-shrink: 0;
  }
  .f-arrow { color: rgba(255,255,255,0.2); font-size: 1.1rem; }

  /* ── DISCOVER ───────────────────────────────────────────────────────────── */
  .disc-filters { display: flex; gap: 9px; flex-wrap: wrap; margin-bottom: 14px; }
  .disc-input {
    flex: 1; min-width: 130px; padding: 9px 13px; border-radius: 11px;
    border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05);
    color: #fff; font-size: 0.86rem; outline: none; transition: border-color 0.18s;
  }
  .disc-input::placeholder { color: rgba(255,255,255,0.28); }
  .disc-input:focus { border-color: rgba(255,184,74,0.38); }
  .disc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 13px; }
  .disc-card {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 17px; padding: 18px;
    display: flex; align-items: flex-start; gap: 13px;
    transition: background 0.16s, border-color 0.16s;
  }
  .disc-card:hover { background: rgba(255,255,255,0.07); border-color: rgba(255,184,74,0.2); }
  .disc-av {
    width: 50px; height: 50px; border-radius: 50%;
    background: linear-gradient(135deg, #a78bfa, #7c3aed);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.2rem; font-weight: 800; color: #fff; flex-shrink: 0;
  }
  .disc-info { flex: 1; min-width: 0; }
  .disc-name { font-size: 0.9rem; font-weight: 700; color: #fff; margin-bottom: 2px; }
  .disc-course { font-size: 0.76rem; color: rgba(255,255,255,0.42); margin-bottom: 4px; }
  .disc-mutual { display: inline-flex; align-items: center; gap: 4px; font-size: 0.74rem; color: #ffb84a; font-weight: 600; margin-bottom: 5px; }
  .disc-bio { font-size: 0.78rem; color: rgba(255,255,255,0.35); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .disc-add {
    background: rgba(255,184,74,0.1); border: 1px solid rgba(255,184,74,0.26);
    border-radius: 9px; padding: 7px 13px;
    font-size: 0.76rem; font-weight: 600; color: #ffb84a;
    cursor: pointer; flex-shrink: 0; align-self: center;
    transition: background 0.14s;
  }
  .disc-add:hover { background: rgba(255,184,74,0.2); }

  /* ── CHAT LAYOUT ────────────────────────────────────────────────────────── */
  .chat-wrap {
    display: flex;
    height: 100%;
    overflow: hidden;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.07);
  }
  .chat-list-col {
    width: 280px; flex-shrink: 0;
    display: flex; flex-direction: column;
    border-right: 1px solid rgba(255,255,255,0.07);
    background: rgba(0,0,0,0.22);
    overflow: hidden;
  }
  .chat-list-head {
    padding: 16px 14px 12px; flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    display: flex; align-items: center; justify-content: space-between;
  }
  .chat-list-title { font-size: 0.95rem; font-weight: 700; color: #fff; }
  .chat-req-btn {
    font-size: 0.72rem; font-weight: 600; color: #ffb84a;
    background: rgba(255,184,74,0.1); border: 1px solid rgba(255,184,74,0.2);
    border-radius: 7px; padding: 4px 9px; cursor: pointer;
  }
  .chat-threads { flex: 1; overflow-y: auto; padding: 7px; }
  .ct {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 11px; border-radius: 11px; cursor: pointer;
    width: 100%; text-align: left; background: transparent; border: none;
    transition: background 0.13s;
  }
  .ct:hover { background: rgba(255,255,255,0.05); }
  .ct.active { background: rgba(255,184,74,0.08); }
  .ct-av {
    width: 38px; height: 38px; border-radius: 50%;
    background: linear-gradient(135deg, #ffb84a, #ff8c42);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.9rem; font-weight: 800; color: #1a0e00; flex-shrink: 0;
  }
  .ct-meta { flex: 1; min-width: 0; }
  .ct-name { font-size: 0.85rem; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ct-sub { font-size: 0.72rem; color: rgba(255,255,255,0.38); }
  .ct-badge {
    background: #ffb84a; color: #1a0e00;
    font-size: 0.62rem; font-weight: 800;
    padding: 2px 6px; border-radius: 100px; flex-shrink: 0;
  }

  /* ── CHAT PANEL ─────────────────────────────────────────────────────────── */
  .chat-panel-col {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column;
    overflow: hidden;
    background: rgba(255,255,255,0.01);
  }
  .chat-panel-hdr {
    padding: 12px 16px; flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    background: rgba(0,0,0,0.15);
    display: flex; align-items: center; justify-content: space-between;
  }
  .chat-hdr-profile { display: flex; align-items: center; gap: 11px; }
  .chat-hdr-av {
    width: 36px; height: 36px; border-radius: 50%;
    background: linear-gradient(135deg, #ffb84a, #ff8c42);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.88rem; font-weight: 800; color: #1a0e00;
  }
  .chat-hdr-name { font-size: 0.9rem; font-weight: 700; color: #fff; margin: 0; }
  .chat-hdr-sub { font-size: 0.72rem; color: rgba(255,255,255,0.38); margin: 0; }
  .chat-hdr-actions { display: flex; gap: 7px; }
  .chat-act-btn {
    width: 34px; height: 34px; border-radius: 9px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.09);
    display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,0.65); cursor: pointer;
    transition: background 0.13s, color 0.13s;
  }
  .chat-act-btn:hover { background: rgba(255,184,74,0.14); color: #ffb84a; }

  /* ── MESSAGES AREA ──────────────────────────────────────────────────────── */
  .msgs-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 14px 16px;
    display: flex; flex-direction: column; gap: 7px;
    min-height: 0;
  }
  .msg-row { display: flex; }
  .msg-row.mine { justify-content: flex-end; }
  .msg-bub {
    max-width: 70%; padding: 9px 13px; border-radius: 17px;
    background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.08);
    color: #dde1ec; font-size: 0.86rem; line-height: 1.5; word-break: break-word;
  }
  .msg-bub.mine {
    background: linear-gradient(135deg, #ffb84a, #ff8c42);
    border-color: transparent; color: #1a0e00;
  }
  .msg-img { max-width: 100%; border-radius: 9px; margin-bottom: 5px; display: block; }
  .msg-meta { display: flex; align-items: center; gap: 4px; margin-top: 4px; justify-content: flex-end; }
  .msg-time { font-size: 0.65rem; opacity: 0.55; }
  .typing-bub {
    display: flex; align-items: center; gap: 4px;
    padding: 9px 13px; border-radius: 17px;
    background: rgba(255,255,255,0.07); width: fit-content;
  }
  .t-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: rgba(255,255,255,0.5); animation: tdot 1.2s infinite;
  }
  .t-dot:nth-child(2){animation-delay:0.2s}
  .t-dot:nth-child(3){animation-delay:0.4s}
  @keyframes tdot{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}
  .msgs-empty {
    flex: 1; display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,0.25); font-size: 0.84rem; text-align: center;
  }

  /* ── COMPOSER ───────────────────────────────────────────────────────────── */
  .composer {
    padding: 10px 14px; flex-shrink: 0;
    border-top: 1px solid rgba(255,255,255,0.07);
    background: rgba(0,0,0,0.14);
    display: flex; align-items: center; gap: 9px;
  }
  .composer-icon {
    width: 34px; height: 34px; border-radius: 9px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,0.45); cursor: pointer; flex-shrink: 0;
    transition: background 0.13s, color 0.13s;
  }
  .composer-icon:hover { background: rgba(255,255,255,0.1); color: #fff; }
  .composer-input {
    flex: 1; background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 11px; padding: 9px 13px;
    color: #fff; font-size: 0.86rem; outline: none;
    transition: border-color 0.18s; min-width: 0;
  }
  .composer-input::placeholder { color: rgba(255,255,255,0.25); }
  .composer-input:focus { border-color: rgba(255,184,74,0.35); }
  .send-btn {
    width: 34px; height: 34px; border-radius: 9px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,0.25); cursor: pointer; flex-shrink: 0;
    transition: background 0.18s, color 0.18s;
  }
  .send-btn.on { background: linear-gradient(135deg,#ffb84a,#ff8c42); border-color:transparent; color:#1a0e00; }
  .img-preview {
    padding: 7px 14px 0;
    display: flex; align-items: center; gap: 9px;
  }
  .img-preview img { height: 52px; border-radius: 7px; object-fit: cover; }
  .img-rm {
    width: 20px; height: 20px; border-radius: 50%;
    background: rgba(255,60,60,0.75); border: none;
    color: #fff; font-size: 0.85rem; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }

  /* ── PROFILE ────────────────────────────────────────────────────────────── */
  .prof-layout { display: flex; flex-direction: column; gap: 16px; }
  .prof-hero {
    background: linear-gradient(135deg, #0d2137, #0a1628);
    border: 1px solid rgba(255,184,74,0.16);
    border-radius: 18px; padding: 24px 20px;
    display: flex; flex-direction: column; align-items: center;
    text-align: center; gap: 12px;
  }
  .prof-big-av {
    width: 76px; height: 76px; border-radius: 50%;
    background: linear-gradient(135deg, #ffb84a, #ff8c42);
    display: flex; align-items: center; justify-content: center;
    font-size: 2rem; font-weight: 800; color: #1a0e00;
    box-shadow: 0 0 0 4px rgba(255,184,74,0.18);
  }
  .prof-name { font-size: 1.15rem; font-weight: 800; color: #fff; margin: 0; }
  .prof-email { font-size: 0.8rem; color: rgba(255,255,255,0.4); margin: 0; }
  .prof-stats {
    display: flex; width: 100%;
    background: rgba(255,255,255,0.05); border-radius: 12px; overflow: hidden;
    border: 1px solid rgba(255,255,255,0.07);
  }
  .prof-stat {
    flex: 1; padding: 12px 6px; text-align: center;
    border-right: 1px solid rgba(255,255,255,0.06);
  }
  .prof-stat:last-child { border-right: none; }
  .prof-stat strong { display: block; font-size: 1.2rem; color: #fff; font-weight: 800; }
  .prof-stat span { font-size: 0.68rem; color: rgba(255,255,255,0.35); }
  .prof-logout {
    background: rgba(255,70,70,0.1); border: 1px solid rgba(255,70,70,0.22);
    color: #ff6b6b; border-radius: 11px; padding: 9px 22px;
    font-size: 0.86rem; font-weight: 600; cursor: pointer; transition: background 0.14s;
  }
  .prof-logout:hover { background: rgba(255,70,70,0.18); }
  .prof-panel {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px; overflow: hidden;
  }
  .prof-panel-hdr {
    padding: 14px 18px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    display: flex; align-items: center; justify-content: space-between;
  }
  .prof-panel-title { font-size: 0.9rem; font-weight: 700; color: #fff; margin: 0; }
  .prof-panel-count { font-size: 0.76rem; color: rgba(255,255,255,0.32); }
  .prof-item {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 18px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .prof-item:last-child { border-bottom: none; }
  .prof-item-icon {
    width: 34px; height: 34px; border-radius: 9px;
    background: rgba(255,184,74,0.1);
    display: flex; align-items: center; justify-content: center;
    color: #ffb84a; font-size: 0.78rem; font-weight: 700; flex-shrink: 0;
  }
  .prof-item-body { flex: 1; min-width: 0; }
  .prof-item-title { font-size: 0.83rem; font-weight: 700; color: #fff; margin-bottom: 2px; }
  .prof-item-sub { font-size: 0.74rem; color: rgba(255,255,255,0.36); }
  .accept-btn {
    background: linear-gradient(135deg, #4ee1b7, #1b8a6b);
    border: none; border-radius: 8px; padding: 6px 13px;
    font-size: 0.76rem; font-weight: 700; color: #fff;
    cursor: pointer; flex-shrink: 0;
  }
  .unblock-btn {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px; padding: 6px 11px;
    font-size: 0.74rem; font-weight: 600; color: rgba(255,255,255,0.5);
    cursor: pointer; flex-shrink: 0; display: flex; align-items: center; gap: 4px;
  }
  .prof-empty {
    padding: 18px; text-align: center;
    color: rgba(255,255,255,0.25); font-size: 0.8rem;
    display: flex; flex-direction: column; align-items: center; gap: 7px;
  }

  /* ── MOBILE OVERRIDES ───────────────────────────────────────────────────── */
  @media (max-width: 768px) {
    .ds-sidebar { display: none !important; }
    .ds-bottom-nav { display: flex !important; }
    .ds-main { padding: 14px 14px 6px; }

    /* on mobile chat: switch between list and convo views */
    .chat-wrap { border-radius: 0; border: none; }
    .chat-list-col { width: 100%; border-right: none; }
    .chat-list-col.hidden { display: none; }
    .chat-panel-col.hidden { display: none; }

    .hero-card { padding: 24px 18px; min-height: 210px; }
    .hero-title { font-size: 1.45rem; }
    .sug-grid { grid-template-columns: repeat(2, 1fr); }
    .disc-grid { grid-template-columns: 1fr; }
  }

  /* call overlays */
  @keyframes pulse {
    0%{transform:scale(1);box-shadow:0 0 0 0 rgba(78,225,183,0.4)}
    70%{transform:scale(1.05);box-shadow:0 0 0 20px rgba(78,225,183,0)}
    100%{transform:scale(1);box-shadow:0 0 0 0 rgba(78,225,183,0)}
  }
`;

export function Dashboard({ token, user, onLogout }: DashboardProps) {
  const navigate = useNavigate();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [zegoConfig, setZegoConfig] = useState<{ appId: number; serverSecret: string } | null>(null);
  const [activeCall, setActiveCall] = useState<{ roomId: string; isVideo: boolean } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ callerId: string; callerName: string; isVideo: boolean; roomId: string } | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{ roomId: string; isVideo: boolean; receiverName: string } | null>(null);

  const [discoverUsers, setDiscoverUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserEntry[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [messageInput, setMessageInput] = useState("");
  const [status, setStatus] = useState("Ready to explore the campus network.");
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [chatView, setChatView] = useState<ChatView>("list"); // mobile chat sub-view
  const [courseFilter, setCourseFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const selectedFriendName = useMemo(() => selectedFriend?.fullName ?? "Select a friend", [selectedFriend]);
  const selectedFriendId = selectedFriend?.id ?? null;
  const suggestedStudents = useMemo(() => discoverUsers.slice(0, 6), [discoverUsers]);
  const pendingCount = requests.length;
  const recentFriends = useMemo(() => friends.slice(0, 3), [friends]);
  const conversationIsOpen = activeTab === "chat" && !!selectedFriendId;
  const totalUnread = useMemo(() => Object.values(unreadCounts).reduce((a, b) => a + b, 0), [unreadCounts]);

  const fmtTime = (v: string) => new Date(v).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const friendSub = (f: User) => {
    if (f.interests) return f.interests;
    if (f.course && f.year) return `${f.course} • ${f.year} Year`;
    return "Available to chat";
  };
  const fmtBadge = (n: number) => (n >= 4 ? "4+" : `+${n}`);

  const topbarTitle = () => {
    if (activeTab === "home") return "Campus Connect";
    if (activeTab === "discover") return "Discover";
    if (activeTab === "chat") {
      if (chatView === "convo" && selectedFriend) return selectedFriend.fullName;
      return "Messages";
    }
    return "Profile";
  };

  const showBackBtn = activeTab === "chat" && chatView === "convo";

  function openConvo(friend: User) {
    setSelectedFriend(friend);
    setChatView("convo");
    setActiveTab("chat");
  }

  function handleNavigate(tab: AppTab) {
    setActiveTab(tab);
    if (tab === "chat") setChatView("list");
  }

  // ─── GSAP ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".da-reveal", {
        y: 14, opacity: 0, duration: 0.45, stagger: 0.055,
        ease: "power2.out", clearProps: "all",
      });
    }, shellRef);
    return () => ctx.revert();
  }, [activeTab, chatView]);

  // ─── SOCKET ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = connectSocket(token);

    socket.on("message:new", (message: Message) => {
      setMessages((c) => (c.some((e) => e.id === message.id) ? c : [...c, message]));
      if (selectedFriendId === message.senderId && conversationIsOpen && document.visibilityState === "visible") {
        socket.emit("message:read", { messageIds: [message.id], senderId: message.senderId });
        setUnreadCounts((c) => ({ ...c, [message.senderId]: 0 }));
      } else if (message.senderId !== user.id) {
        setUnreadCounts((c) => ({ ...c, [message.senderId]: Math.min((c[message.senderId] ?? 0) + 1, 99) }));
      }
    });

    socket.on("message:read:update", ({ messageIds }: { messageIds: string[] }) => {
      setMessages((c) => c.map((m) => (messageIds.includes(m.id) ? { ...m, isRead: true } : m)));
    });

    socket.on("typing:started", ({ typerId }: { typerId: string }) => {
      if (selectedFriend?.id === typerId) setPartnerTyping(true);
    });
    socket.on("typing:stopped", ({ typerId }: { typerId: string }) => {
      if (selectedFriend?.id === typerId) setPartnerTyping(false);
    });

    socket.on("call:incoming", (p: { callerId: string; callerName: string; isVideo: boolean; roomId: string }) => setIncomingCall(p));
    socket.on("call:accepted", ({ roomId }: { roomId: string }) => {
      setOutgoingCall((cur) => {
        if (cur?.roomId === roomId) { setActiveCall({ roomId, isVideo: cur.isVideo }); return null; }
        return cur;
      });
    });
    socket.on("call:declined", () => { setOutgoingCall(null); setStatus("Call declined."); });
    socket.on("notification:new", (n: AppNotification) => {
      setNotifications((c) => [n, ...c].slice(0, 20));
      setStatus(n.message);
      void Promise.all([loadFriends(), loadRequests()]);
    });
    socket.on("message:error", (p: { message: string }) => setStatus(p.message));

    return () => {
      ["message:new","message:read:update","typing:started","typing:stopped",
       "call:incoming","call:accepted","call:declined","notification:new","message:error"]
        .forEach((e) => socket.off(e));
      disconnectSocket();
    };
  }, [token, selectedFriendId, conversationIsOpen, user.id]);

  useEffect(() => {
    void Promise.all([
      loadDiscover(), loadFriends(), loadRequests(), loadBlockedUsers(),
      api.get("/zego-config").then((r) => setZegoConfig(r.data)),
    ]);
  }, [courseFilter, yearFilter]);

  useEffect(() => {
    if (!selectedFriendId) return;
    getSocket()?.emit("join:conversation", { otherUserId: selectedFriendId });
    void loadConversation(selectedFriendId, conversationIsOpen && document.visibilityState === "visible");
  }, [selectedFriendId, conversationIsOpen]);

  useEffect(() => {
    const fn = () => {
      if (document.visibilityState === "visible" && selectedFriendId && conversationIsOpen)
        void loadConversation(selectedFriendId, true);
    };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [selectedFriendId, conversationIsOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, partnerTyping, imagePreview]);

  // ─── API ──────────────────────────────────────────────────────────────────
  async function loadDiscover() {
    const p = new URLSearchParams();
    if (courseFilter) p.append("course", courseFilter);
    if (yearFilter) p.append("year", yearFilter);
    const r = await api.get(`/discover${p.toString() ? `?${p}` : ""}`);
    setDiscoverUsers(r.data);
  }
  async function loadFriends() {
    const r = await api.get("/friends");
    setFriends(r.data);
  }
  async function loadRequests() {
    const r = await api.get("/friend-requests");
    setRequests(r.data);
  }
  async function loadBlockedUsers() {
    const r = await api.get("/blocked-users");
    setBlockedUsers(r.data);
  }
  async function loadConversation(otherId: string, markRead = false) {
    const r = await api.get(`/messages/${otherId}`);
    const msgs: Message[] = r.data.messages;
    setMessages(msgs);
    const unread = msgs.filter((m) => m.senderId === otherId && !m.isRead).map((m) => m.id);
    if (markRead && unread.length > 0) {
      getSocket()?.emit("message:read", { messageIds: unread, senderId: otherId });
      setMessages((c) => c.map((m) => (unread.includes(m.id) ? { ...m, isRead: true } : m)));
    }
    if (markRead) setUnreadCounts((c) => ({ ...c, [otherId]: 0 }));
  }
  async function sendFriendRequest(id: string) {
    await api.post("/friend-requests", { receiverId: id });
    setStatus("Friend request sent!");
    void Promise.all([loadFriends(), loadDiscover()]);
  }
  async function acceptRequest(id: string) {
    await api.post(`/friend-requests/${id}/accept`);
    setStatus("Friend request accepted.");
    setNotifications((c) => [{ id: `local-${id}`, type: "system", message: "Friend request accepted.", createdAt: new Date().toISOString() }, ...c].slice(0, 20));
    await Promise.all([loadFriends(), loadRequests()]);
  }
  async function unblockUser(uid: string) {
    await api.delete(`/users/${uid}/block`);
    setStatus("User unblocked.");
    await Promise.all([loadBlockedUsers(), loadDiscover(), loadFriends(), loadRequests()]);
  }

  // ─── CALLS ────────────────────────────────────────────────────────────────
  function handleStartCall(isVideo: boolean) {
    if (!selectedFriend) return;
    const roomId = getConversationRoom(user.id, selectedFriend.id);
    setOutgoingCall({ roomId, isVideo, receiverName: selectedFriend.fullName });
    getSocket()?.emit("call:initiate", { receiverId: selectedFriend.id, isVideo, roomId });
  }
  function handleAcceptCall() {
    if (!incomingCall) return;
    getSocket()?.emit("call:accept", { callerId: incomingCall.callerId, roomId: incomingCall.roomId });
    const f = friends.find((x) => x.id === incomingCall.callerId);
    if (f) openConvo(f);
    setActiveCall({ roomId: incomingCall.roomId, isVideo: incomingCall.isVideo });
    setIncomingCall(null);
  }
  function handleDeclineCall() {
    if (!incomingCall) return;
    getSocket()?.emit("call:decline", { callerId: incomingCall.callerId });
    setIncomingCall(null);
  }

  // ─── MESSAGES ─────────────────────────────────────────────────────────────
  function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!selectedFriend || (!messageInput.trim() && !imagePreview)) return;
    getSocket()?.emit("message:send", { receiverId: selectedFriend.id, content: messageInput, imageUrl: imagePreview });
    getSocket()?.emit("typing:stop", { receiverId: selectedFriend.id });
    setMessageInput(""); setImagePreview(null);
  }
  function handleTyping(e: React.ChangeEvent<HTMLInputElement>) {
    setMessageInput(e.target.value);
    if (!selectedFriend) return;
    if (!isTyping) { setIsTyping(true); getSocket()?.emit("typing:start", { receiverId: selectedFriend.id }); }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false); getSocket()?.emit("typing:stop", { receiverId: selectedFriend.id });
    }, 2000);
  }
  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onloadend = () => setImagePreview(r.result as string);
    r.readAsDataURL(file);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER SECTIONS
  // ──────────────────────────────────────────────────────────────────────────

  const renderHome = () => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* HERO */}
      <section className="hero-card da-reveal">
        <div className="hero-glow" /><div className="hero-glow2" />
        <div className="hero-inner">
          <div className="hero-badge"><span className="hero-dot" />LIVE RANDOM CHAT</div>
          <h1 className="hero-title">
            Talk to someone new<br />
            <span className="hero-accent">from campus</span> in a tap.
          </h1>
          <p className="hero-sub">{status}</p>
          <button className="hero-cta" onClick={() => navigate("/app/random")}>
            <Flame size={17} /> Start Random Chat
          </button>
        </div>
      </section>

      {/* SUGGESTED */}
      <section className="sec da-reveal">
        <div className="sec-head">
          <h3 className="sec-title">Suggested students</h3>
          <button className="sec-link" onClick={() => setActiveTab("discover")}>View all</button>
        </div>
        {suggestedStudents.length === 0
          ? <div className="sec-empty">No suggestions yet — check back soon.</div>
          : <div className="sug-grid">
              {suggestedStudents.map((s) => (
                <article className="sug-card" key={s.id}>
                  <div className="sug-av">{s.fullName[0].toUpperCase()}</div>
                  <strong className="sug-name">{s.fullName}</strong>
                  <span className="sug-sub">{s.interests || "Exploring campus life"}</span>
                  <button className="conn-btn" onClick={() => void sendFriendRequest(s.id)}>
                    <UserPlus size={12} /> Connect
                  </button>
                </article>
              ))}
            </div>
        }
      </section>

      {/* ACTIVE FRIENDS */}
      <section className="sec da-reveal">
        <div className="sec-head">
          <h3 className="sec-title">Active friends</h3>
          <button className="sec-link" onClick={() => handleNavigate("chat")}>View all</button>
        </div>
        {recentFriends.length === 0
          ? <div className="sec-empty">No friends yet — accept a request to start chatting.</div>
          : <div className="friend-rows">
              {recentFriends.map((f) => (
                <button className="f-row" key={f.id} onClick={() => openConvo(f)}>
                  <span className="f-av">{f.fullName[0].toUpperCase()}</span>
                  <span className="f-info">
                    <span className="f-name">{f.fullName}</span>
                    <span className="f-sub">{unreadCounts[f.id] ? `${fmtBadge(unreadCounts[f.id])} new messages` : friendSub(f)}</span>
                  </span>
                  {unreadCounts[f.id]
                    ? <span className="f-unread-pill">{fmtBadge(unreadCounts[f.id])}</span>
                    : <span className="f-arrow">›</span>
                  }
                </button>
              ))}
            </div>
        }
      </section>
    </div>
  );

  const renderDiscover = () => (
    <div className="da-reveal">
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 4px", color: "#fff", fontSize: "0.97rem" }}>Discover students</h3>
        <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.38)" }}>{discoverUsers.length} students found</span>
      </div>
      <div className="disc-filters">
        <input className="disc-input" placeholder="Filter by course (e.g. CSE)" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} />
        <input className="disc-input" placeholder="Filter by year (e.g. 2nd)" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} />
      </div>
      <div className="disc-grid">
        {discoverUsers.map((s) => (
          <article className="disc-card" key={s.id}>
            <div className="disc-av">{s.fullName[0].toUpperCase()}</div>
            <div className="disc-info">
              <div className="disc-name">{s.fullName}</div>
              <div className="disc-course">{s.course && s.year ? `${s.course} • ${s.year} Year` : s.email}</div>
              {s.mutualConnections !== undefined && s.mutualConnections > 0 && (
                <div className="disc-mutual"><Users size={10} />{s.mutualConnections} mutual</div>
              )}
              <div className="disc-bio">{s.bio || "New to LPU TV."}</div>
            </div>
            <button className="disc-add" onClick={() => void sendFriendRequest(s.id)}>Add</button>
          </article>
        ))}
      </div>
    </div>
  );

  const renderChatThreadList = () => (
    <div className="chat-list-col da-reveal">
      <div className="chat-list-head">
        <span className="chat-list-title">Messages</span>
        <button className="chat-req-btn">Requests {pendingCount > 0 && `(${pendingCount})`}</button>
      </div>
      <div className="chat-threads">
        {friends.length === 0
          ? <div style={{ padding: "18px 10px", textAlign: "center", color: "rgba(255,255,255,0.28)", fontSize: "0.82rem" }}>
              No friends yet. Accept requests to start chatting.
            </div>
          : friends.map((f) => (
              <button
                className={`ct${selectedFriend?.id === f.id ? " active" : ""}`}
                key={f.id}
                onClick={() => openConvo(f)}
              >
                <span className="ct-av">{f.fullName[0].toUpperCase()}</span>
                <span className="ct-meta">
                  <span className="ct-name">{f.fullName}</span>
                  <span className="ct-sub">{unreadCounts[f.id] ? `${fmtBadge(unreadCounts[f.id])} new messages` : friendSub(f)}</span>
                </span>
                {unreadCounts[f.id] ? <span className="ct-badge">{fmtBadge(unreadCounts[f.id])}</span> : null}
              </button>
            ))
        }
      </div>
    </div>
  );

  const renderChatConvo = () => (
    <div className="chat-panel-col">
      {activeCall && zegoConfig && selectedFriend ? (
        <div style={{ flex: 1, position: "relative", background: "#000", display: "flex", flexDirection: "column" }}>
          <VideoRoom
            appId={zegoConfig.appId} serverSecret={zegoConfig.serverSecret}
            roomId={activeCall.roomId} userId={user.id} userName={user.fullName}
            isAudioOnly={!activeCall.isVideo} onJoined={() => setStatus("Call started.")}
          />
          {!activeCall.isVideo && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(10,14,23,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
              <div style={{ width: 100, height: 100, borderRadius: "50%", background: "linear-gradient(135deg,#ffc55d,#ff6b6b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.8rem", fontWeight: 800, color: "#fff", marginBottom: 18 }}>
                {selectedFriendName[0].toUpperCase()}
              </div>
              <h3 style={{ margin: 0, color: "#fff" }}>{selectedFriendName}</h3>
              <p style={{ color: "rgba(255,255,255,0.5)", marginTop: 6 }}>Audio call in progress…</p>
            </div>
          )}
          <button onClick={() => setActiveCall(null)} style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,70,70,0.88)", padding: "8px 18px", borderRadius: 18, border: "none", color: "#fff", cursor: "pointer", zIndex: 9999, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Phone size={14} style={{ transform: "rotate(135deg)" }} /> End Call
          </button>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="chat-panel-hdr">
            <div className="chat-hdr-profile">
              <div className="chat-hdr-av">{selectedFriendName[0].toUpperCase()}</div>
              <div>
                <p className="chat-hdr-name">{selectedFriendName}</p>
                <p className="chat-hdr-sub">{partnerTyping ? "typing…" : selectedFriend ? friendSub(selectedFriend) : "Select a friend"}</p>
              </div>
            </div>
            {selectedFriend && (
              <div className="chat-hdr-actions">
                <button className="chat-act-btn" onClick={() => handleStartCall(false)}><Phone size={15} /></button>
                <button className="chat-act-btn" onClick={() => handleStartCall(true)}><Camera size={15} /></button>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="msgs-area">
            {messages.length === 0
              ? <div className="msgs-empty">
                  {selectedFriend ? `Say hello to ${selectedFriend.fullName} 👋` : "Select a friend to start chatting"}
                </div>
              : messages.map((m) => {
                  const mine = m.senderId === user.id;
                  return (
                    <div className={`msg-row${mine ? " mine" : ""}`} key={m.id}>
                      <div className={`msg-bub${mine ? " mine" : ""}`}>
                        {m.imageUrl && <img src={m.imageUrl} alt="img" className="msg-img" />}
                        {m.content && <span>{m.content}</span>}
                        <div className="msg-meta">
                          <small className="msg-time">{fmtTime(m.createdAt)}</small>
                          {mine && (m.isRead
                            ? <CheckCheck size={12} color={mine ? "#1a0e00" : "#7ce9d6"} />
                            : <Check size={12} color="rgba(0,0,0,0.4)" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
            }
            {partnerTyping && (
              <div className="msg-row"><div className="typing-bub"><span className="t-dot"/><span className="t-dot"/><span className="t-dot"/></div></div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Image preview */}
          {imagePreview && (
            <div className="img-preview">
              <img src={imagePreview} alt="preview" />
              <button className="img-rm" onClick={() => setImagePreview(null)}>×</button>
            </div>
          )}

          {/* Composer */}
          <form onSubmit={handleSend} className="composer">
            <input type="file" accept="image/*" style={{ display: "none" }} ref={fileInputRef} onChange={handleImageUpload} />
            <button type="button" className="composer-icon" onClick={() => fileInputRef.current?.click()}><ImagePlus size={16} /></button>
            <input className="composer-input" placeholder="Message…" value={messageInput} onChange={handleTyping} />
            <button type="submit" className={`send-btn${messageInput.trim() || imagePreview ? " on" : ""}`} disabled={!messageInput.trim() && !imagePreview}>
              <Send size={15} />
            </button>
          </form>
        </>
      )}
    </div>
  );

  const renderChat = () => (
    // Desktop: always show both columns
    // Mobile: show either list or convo based on chatView
    <div className="chat-wrap" style={{ height: "100%" }}>
      <div className={`chat-list-col${chatView === "convo" ? " hidden" : ""}`} style={{ display: undefined }}>
        {renderChatThreadList()}
      </div>
      <div className={`chat-panel-col${chatView === "list" ? " hidden" : ""}`} style={{ display: undefined }}>
        {selectedFriend
          ? renderChatConvo()
          : <div className="msgs-empty" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}>
                <MessageCircle size={32} style={{ opacity: 0.2, marginBottom: 10 }} />
                <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.86rem" }}>Select a conversation to start messaging</p>
              </div>
            </div>
        }
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="prof-layout da-reveal">
      <article className="prof-hero">
        <div className="prof-big-av">{user.fullName[0].toUpperCase()}</div>
        <div><p className="prof-name">{user.fullName}</p><p className="prof-email">{user.email}</p></div>
        <div className="prof-stats">
          <div className="prof-stat"><strong>{friends.length}</strong><span>Friends</span></div>
          <div className="prof-stat"><strong>{pendingCount}</strong><span>Requests</span></div>
          <div className="prof-stat"><strong>{discoverUsers.length}</strong><span>Discover</span></div>
        </div>
        <button className="prof-logout" onClick={onLogout}>Logout</button>
      </article>

      <article className="prof-panel">
        <div className="prof-panel-hdr">
          <h3 className="prof-panel-title">Notifications & Requests</h3>
          <span className="prof-panel-count">{notifications.length + requests.length} items</span>
        </div>
        <div>
          {notifications.length === 0 && requests.length === 0
            ? <div className="prof-empty">No notifications yet.</div>
            : null}
          {notifications.map((n) => (
            <div className="prof-item" key={n.id}>
              <div className="prof-item-icon">{n.type === "friend_accept" ? "✓" : n.type === "friend_request" ? "+" : "i"}</div>
              <div className="prof-item-body">
                <div className="prof-item-title">{n.type === "friend_accept" ? "Friend accepted" : n.type === "friend_request" ? "New request" : "Update"}</div>
                <div className="prof-item-sub">{n.message}</div>
              </div>
            </div>
          ))}
          {requests.map((r) => (
            <div className="prof-item" key={r.id}>
              <div className="prof-item-icon" style={{ background: "rgba(78,225,183,0.1)", color: "#4ee1b7" }}>+</div>
              <div className="prof-item-body">
                <div className="prof-item-title">{r.sender.fullName}</div>
                <div className="prof-item-sub">{r.sender.email}</div>
              </div>
              <button className="accept-btn" onClick={() => void acceptRequest(r.id)}>Accept</button>
            </div>
          ))}
        </div>
      </article>

      <article className="prof-panel">
        <div className="prof-panel-hdr">
          <h3 className="prof-panel-title">Blocked users</h3>
          <span className="prof-panel-count">{blockedUsers.length} hidden</span>
        </div>
        <div>
          {blockedUsers.length === 0
            ? <div className="prof-empty"><Lock size={16} />People you block during random chat appear here.</div>
            : blockedUsers.map((e) => (
                <div className="prof-item" key={e.id}>
                  <div className="prof-item-icon" style={{ background: "rgba(255,70,70,0.1)", color: "#ff6b6b" }}><ShieldBan size={14} /></div>
                  <div className="prof-item-body">
                    <div className="prof-item-title">{e.user.fullName}</div>
                    <div className="prof-item-sub">{e.reason ? `Reason: ${e.reason}` : e.user.email}</div>
                  </div>
                  <button className="unblock-btn" onClick={() => void unblockUser(e.user.id)}><ShieldBan size={12} />Unblock</button>
                </div>
              ))
          }
        </div>
      </article>
    </div>
  );

  // ──────────────────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="ds-shell" ref={shellRef}>
      <style>{GLOBAL_STYLES}</style>

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="ds-sidebar">
        <div className="ds-brand">
          <div className="ds-brand-avatar">{user.fullName[0].toUpperCase()}</div>
          <div>
            <div className="ds-brand-name">LPU TV</div>
            <div className="ds-brand-sub">{user.fullName}</div>
          </div>
        </div>
        <div className="ds-side-section">
          <div className="ds-side-label">Friends</div>
          {friends.length === 0
            ? <p className="ds-side-empty">No friends yet.</p>
            : friends.map((f) => (
                <button
                  key={f.id}
                  className={`ds-side-chip${selectedFriend?.id === f.id && activeTab === "chat" ? " active" : ""}`}
                  onClick={() => openConvo(f)}
                >
                  <div className="ds-side-chip-av">{f.fullName[0].toUpperCase()}</div>
                  <span className="ds-side-chip-name">{f.fullName}</span>
                  {unreadCounts[f.id] ? <span className="ds-unread-pill">{fmtBadge(unreadCounts[f.id])}</span> : null}
                </button>
              ))
          }
        </div>
      </aside>

      {/* ── CONTENT ── */}
      <div className="ds-content">
        {/* Topbar */}
        <header className="ds-topbar">
          <div className="ds-topbar-left">
            {showBackBtn && (
              <button className="ds-icon-btn" onClick={() => setChatView("list")} aria-label="Back">
                <ArrowLeft size={17} />
              </button>
            )}
            <span className="ds-topbar-title">{topbarTitle()}</span>
          </div>
          <div
            className="ds-topbar-avatar"
            onClick={() => handleNavigate("profile")}
            role="button"
            tabIndex={0}
          >
            {user.fullName[0].toUpperCase()}
          </div>
        </header>

        {/* Main content */}
        <main className={`ds-main${activeTab === "chat" ? " no-pad" : ""}`}>
          {activeTab === "home" && renderHome()}
          {activeTab === "discover" && renderDiscover()}
          {activeTab === "chat" && renderChat()}
          {activeTab === "profile" && renderProfile()}
        </main>

        {/* Bottom nav */}
        <nav className="ds-bottom-nav">
          <button className={`ds-nav-item${activeTab === "home" ? " active" : ""}`} onClick={() => handleNavigate("home")}>
            <Home size={19} /><span>Home</span>
          </button>
          <button className={`ds-nav-item${activeTab === "discover" ? " active" : ""}`} onClick={() => handleNavigate("discover")}>
            <Search size={19} /><span>Discover</span>
          </button>
          <button className={`ds-nav-item${activeTab === "chat" ? " active" : ""}`} onClick={() => handleNavigate("chat")}>
            <MessageCircle size={19} /><span>Messages</span>
            {totalUnread > 0 && <span className="ds-nav-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>}
          </button>
          <button className={`ds-nav-item${activeTab === "profile" ? " active" : ""}`} onClick={() => handleNavigate("profile")}>
            <UserCircle2 size={19} /><span>Profile</span>
          </button>
        </nav>
      </div>

      {/* Outgoing Call */}
      {outgoingCall && !activeCall && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(10,14,23,0.97)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backdropFilter: "blur(16px)" }}>
          <div style={{ width: 110, height: 110, borderRadius: "50%", background: "linear-gradient(135deg,#4ee1b7,#1b8a6b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem", fontWeight: 800, color: "#fff", marginBottom: 22, animation: "pulse 1.5s infinite" }}>
            {outgoingCall.receiverName[0].toUpperCase()}
          </div>
          <h3 style={{ margin: 0, color: "#fff", fontSize: "1.6rem" }}>{outgoingCall.receiverName}</h3>
          <p style={{ color: "rgba(255,255,255,0.5)", marginTop: 7 }}>Calling…</p>
          <button onClick={() => { setOutgoingCall(null); }} style={{ marginTop: 36, background: "rgba(255,70,70,0.85)", padding: "13px 28px", borderRadius: 28, border: "none", color: "#fff", cursor: "pointer", fontSize: "0.95rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
            <Phone size={16} style={{ transform: "rotate(135deg)" }} /> Cancel
          </button>
        </div>
      )}

      {/* Incoming Call */}
      {incomingCall && !activeCall && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(10,14,23,0.97)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backdropFilter: "blur(16px)" }}>
          <div style={{ width: 110, height: 110, borderRadius: "50%", background: "linear-gradient(135deg,#ffc55d,#ff6b6b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem", fontWeight: 800, color: "#fff", marginBottom: 22 }}>
            {incomingCall.callerName[0].toUpperCase()}
          </div>
          <h3 style={{ margin: 0, color: "#fff", fontSize: "1.6rem" }}>{incomingCall.callerName}</h3>
          <p style={{ color: "rgba(255,255,255,0.5)", marginTop: 7 }}>Incoming {incomingCall.isVideo ? "Video" : "Audio"} Call…</p>
          <div style={{ display: "flex", gap: 18, marginTop: 36 }}>
            <button onClick={handleDeclineCall} style={{ background: "rgba(255,70,70,0.85)", padding: 16, borderRadius: "50%", border: "none", color: "#fff", cursor: "pointer", width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Phone size={24} style={{ transform: "rotate(135deg)" }} />
            </button>
            <button onClick={handleAcceptCall} style={{ background: "#4ee1b7", padding: 16, borderRadius: "50%", border: "none", color: "#000", cursor: "pointer", width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {incomingCall.isVideo ? <Camera size={24} /> : <Phone size={24} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}