import { db, auth } from "./firebaseConfig";
import { doc, setDoc, getDoc, collection, addDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";

/**
 * CAMPOS DISPONÍVEIS NO DOCUMENTO DO USUÁRIO (Firestore):
 * - id: String (UID vindo do Firebase Auth)
 * - nome: String (ex: "User Name")
 * - email: String (ex: "user@email.com")
 * - telefone: String (ex: "(11)99999-9999")
 * - data_cadastro: Timestamp (Data do registro)
 * - perfil_ativo: Boolean (Padrão: true)
 * - historico_pedidos: Array (Lista de IDs de pedidos)
 * - mercado_pago_customer_id: String (ID para compras futuras)
 * * ESTRUTURA DO OBJETO 'endereco' (Deve ser enviado como um Object/Map):
 * - rua: String
 * - numero: String
 * - complemento: String (Opcional)
 * - bairro: String
 * - cidade: String
 * - estado: String
 * - cep: String (Apenas números recomendados)
 */

export const registerUser = async (email, password, userData) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const userName = userData.name || userData.nome || "";

    // O parâmetro 'userData.endereco' deve conter as chaves citadas no comentário acima
    // para manter a consistência com o campo 'map' do banco
    await setDoc(doc(db, "users", user.uid), {
      nome: userName,
      email: email,
      telefone: userData.telefone || "",
      endereco: {
        rua: userData.endereco.rua,
        numero: userData.endereco.numero,
        complemento: userData.endereco.complemento || "",
        bairro: userData.endereco.bairro,
        cidade: userData.endereco.cidade,
        estado: userData.endereco.estado,
        cep: userData.endereco.cep
      },
      data_cadastro: new Date(),
      perfil_ativo: true,
      historico_pedidos: [],
      mercado_pago_customer_id: "", 
      cartao_salvo_id: "",
      cartao_resumo: ""
    });

    // Disparo do e-mail de boas-vindas via coleção "mail"
    await addDoc(collection(db, "mail"), {
      to: email,
      message: {
        subject: "Bem-vindo(a) à Hygge Games!",
        html: `
          <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            <h2 style="color: #FF7A00;">Olá, ${userName || "cliente"}!</h2>
            <p>Que alegria ter você na <strong>Hygge Games</strong>.</p>
            <p>Sua conta foi criada com sucesso! Agora você já pode aproveitar nossos jogos de tabuleiro para se conectar de verdade com quem você ama.</p>
            <br>
            <p>Um abraço caloroso,<br><strong>Equipe Hygge Games</strong></p>
          </div>
        `
      }
    });

    return { success: true, uid: user.uid };
  } catch (error) {
    console.error("Erro ao cadastrar usuário na Hygge Games:", error.message);
    return { success: false, error: error.message };
  }
};

export const getUserData = async (uid) => {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      return userDoc.data();
    }
    return null;
  } catch (error) {
    console.error("Erro ao buscar dados do usuário:", error);
    return null;
  }
};