// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyAFHTfN6KuOwzDsLdWtmZeFAVpVcI-Npfw",
    authDomain: "ideathon-registration-form.firebaseapp.com",
    databaseURL: "https://ideathon-registration-form-default-rtdb.firebaseio.com",
    projectId: "ideathon-registration-form",
    storageBucket: "ideathon-registration-form.appspot.com",
    messagingSenderId: "1094596378197",
    appId: "1:1094596378197:web:81887879503a76e09c5edc",
    measurementId: "G-JSB5Q51DBG"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const storage = getStorage(app);
export const database = getDatabase(app);