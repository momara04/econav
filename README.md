# EcoNav – Route Fuel & Toll Cost Optimizer 🚗⛽

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

EcoNav is a full-stack web application that helps drivers **estimate trip fuel and toll costs**.  
It compares multiple route options by **time, distance, fuel efficiency, tolls, and total cost**, giving users the power to choose the best route for their needs.

👉 *Built as a Computer Science senior project & MVP portfolio app.*

---

## 🌟 Features
- Real-time route cost estimation with **Google Routes API**
- Automatic gas price lookup from **EIA (U.S. Energy Information Administration)**
- Vehicle fuel efficiency via **EPA Fuel Economy API**
- Compare routes by:
  - ⏱ Fastest  
  - 📏 Shortest  
  - 🌱 Most Fuel Efficient  
  - 💵 Cheapest  
- Interactive maps with **Leaflet** (click cards ↔ highlight routes)
- Toll calculation with **E-ZPass support**
- Option to override with custom fuel prices
- Smooth UX touches:
  - Stable route colors across filters  
  - Smooth scroll to results  
  - Mobile-friendly design

---

## 🖼 Screenshots

### Home Page
![Home](./screenshots/home.png)

### Features Section
![Features](./screenshots/features.png)

### Input Form
![Input 1](./screenshots/input-1.png)  
![Input 2](./screenshots/input-2.png)

### Trip Results
![Results 1](./screenshots/results-1.png)  
![Results 2](./screenshots/results-2.png)

---

## 🛠 Tech Stack

**Frontend**
- ![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
- ![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
- ![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
- ![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white)

**Backend**
- ![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
- ![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)

**APIs**
- ![Google Maps](https://img.shields.io/badge/Google%20Maps-4285F4?style=for-the-badge&logo=googlemaps&logoColor=white)
- ![EIA](https://img.shields.io/badge/EIA%20Gas%20Prices-003366?style=for-the-badge)
- ![EPA](https://img.shields.io/badge/EPA%20Fuel%20Economy-228B22?style=for-the-badge)

**Other**
- ![npm](https://img.shields.io/badge/npm-CB3837?style=for-the-badge&logo=npm&logoColor=white)
- ![Git](https://img.shields.io/badge/Git-F05032?style=for-the-badge&logo=git&logoColor=white)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- API keys for:
  - Google Maps (Routes + Geocoding)
  - EIA Fuel Prices
  - EPA Fuel Economy (public, no key required)

---

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env   # add your API keys
npm start

