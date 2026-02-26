import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDIztwLy7OJ-xIsCDok-CCTyk6CtIZv1L0",
  authDomain: "e-commerce-hygge.firebaseapp.com",
  projectId: "e-commerce-hygge",
  storageBucket: "e-commerce-hygge.firebasestorage.app",
  messagingSenderId: "155105905776",
  appId: "1:155105905776:web:ee4a5729408bc5eba078b5",
  measurementId: "G-Y1QX7Y52G5"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// EXPORTAR É OBRIGATÓRIO PARA OS SERVIÇOS FUNCIONAREM
export const db = getFirestore(app);
export const auth = getAuth(app);