import Layout from "./Layout";
import { useAuth } from "../App";
import { QRCodeCanvas } from "qrcode.react";

function CheckIn() {
  const { userCredential } = useAuth();
  const uid = userCredential.user.uid;

  return (
    <Layout>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
        }}
      >
        <h1>Check In with the QR Code Below:</h1>
        <br />
        <QRCodeCanvas value={uid} size={400} style = {{border: "8px solid #1976d2", borderRadius: "20px", padding: "10px", backgroundColor: "white" }} />
      </div>
    </Layout>
  );
}

export default CheckIn;
