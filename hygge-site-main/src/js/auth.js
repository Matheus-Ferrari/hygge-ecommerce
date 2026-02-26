import { auth, db } from '../firebase/firebaseConfig.js';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { registerUser } from "../firebase/userService.js";

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('register-form');
  const errorDiv = document.getElementById('register-error');
  const successDiv = document.getElementById('register-success');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.textContent = '';
    if (successDiv) successDiv.textContent = '';
    const name = form['name'].value.trim();
    const email = form['email'].value.trim();
    const password = form['password'].value;
    const confirm = form['confirm'].value;
    // Novos campos de endereço
    const rua = form['rua']?.value.trim() || '';
    const numero = form['numero']?.value.trim() || '';
    const bairro = form['bairro']?.value.trim() || '';
    const cidade = form['cidade']?.value.trim() || '';
    const estado = form['estado']?.value.trim() || '';
    const cep = form['cep']?.value.trim() || '';
    if (!name || !email || !password || !confirm || !rua || !numero || !bairro || !cidade || !estado || !cep) {
      errorDiv.textContent = 'Preencha todos os campos.';
      return;
    }
    if (password !== confirm) {
      errorDiv.textContent = 'As senhas não coincidem.';
      return;
    }
    const userData = {
      name,
      email,
      endereco: {
        rua,
        numero,
        bairro,
        cidade,
        estado,
        cep
      }
    };
    try {
      await registerUser(email, password, userData);
      if (successDiv) successDiv.textContent = 'Conta criada com sucesso!';
      window.location.href = 'login.html';
    } catch (error) {
      errorDiv.textContent = error.message || 'Erro ao criar conta. Tente novamente.';
    }
  });
});
