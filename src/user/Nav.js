import { AppBar, Container, MenuItem, Toolbar, Typography } from "@mui/material";
import { Link } from "react-router-dom";

function Nav() {
    const links = [
        { to: "/user/home", label: "Home" },
        { to: "/user/profile", label: "Profile" },
        { to: "/user/checkin", label: "Check In" },
        { to: "/user/admin/scan", label: "Admin Scan" }
    ];

    return (
        <AppBar position="static">
            <Container style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '64px' }}>
                <Toolbar disableGutters>
                    <Link to="/user/home" style={{ textDecoration: 'none', color: 'inherit' }}>
                        <Typography
                            variant="h6"
                            noWrap
                            sx={{
                                mr: 2,
                                display: { xs: 'none', md: 'flex' },
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                letterSpacing: '.3rem',
                                color: 'inherit',
                                textDecoration: 'none',
                            }}
                        >
                            IDEATHON
                        </Typography>
                    </Link>

                    {links.map((link) => (
                        <Link key={link.to} to={link.to} style={{ color: 'white', margin: '10px', textDecoration: 'none' }}>
                            <MenuItem key={link.label}>
                                <Typography sx={{ textAlign: 'center' }}>{link.label}</Typography>
                            </MenuItem>
                        </Link>
                    ))}
                </Toolbar>
            </Container>
        </AppBar>
    );
}

export default Nav;
