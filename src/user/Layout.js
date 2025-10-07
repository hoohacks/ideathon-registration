import Nav from "./Nav";

function Layout({ children }) {
    return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <header>
                <Nav />
            </header>
            <main style={{ flex: 1, padding: "20px", width: "800px", maxWidth: "100%", margin: "0 auto" }}>
                {children}
            </main>
            <footer className="text-center p-3 mt-4">
                <p>&copy; 2025 HooHacks</p>
            </footer>
        </div>
    );
}

export default Layout;
