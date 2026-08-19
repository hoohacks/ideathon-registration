import { Box, Container, Typography } from "@mui/material";
import Nav from "./Nav";
import { EVENT } from "../eventInfo";

/**
 * Page frame. The old version pinned main to a fixed 800px, which left the
 * admin tables cramped on a laptop and the short forms adrift on a wide screen.
 * Pages now pick their own width via `maxWidth`.
 */
function Layout({ children, maxWidth = "md" }) {
    return (
        <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
            <Nav />
            <Container
                component="main"
                maxWidth={maxWidth}
                sx={{ flex: 1, width: "100%", py: { xs: 3, sm: 4 } }}
            >
                {children}
            </Container>
            <Box
                component="footer"
                sx={{ borderTop: 1, borderColor: "divider", py: 2.5, mt: 4 }}
            >
                <Container maxWidth={maxWidth}>
                    <Typography variant="body2" align="center">
                        © {EVENT.year} HooHacks · {EVENT.name}
                    </Typography>
                </Container>
            </Box>
        </Box>
    );
}

export default Layout;
