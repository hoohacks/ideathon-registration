import {
    AppBar,
    Container,
    MenuItem,
    Toolbar,
    Typography,
} from "@mui/material";
import { Link } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../App";
import { FaUser, FaGavel } from "react-icons/fa";
import { IoHome, IoQrCodeOutline, IoScan, IoSearch } from "react-icons/io5";
import { RiTeamFill } from "react-icons/ri";

function Nav() {
    const links = [
        { to: "/user/home", label: "Home", icon: <IoHome /> },
        { to: "/user/profile", label: "Profile", icon: <FaUser /> },
        { to: "/user/judging", label: "Judging", icon: <FaGavel /> },
        { to: "/user/checkin", label: "Check In", authTypes: ["competitor", "judge"], icon: <IoQrCodeOutline /> },
        { to: "/user/team", label: "Team", authTypes: ["competitor"], icon: <RiTeamFill /> },
        { to: "/user/admin/scan", label: "Admin Scan", authTypes: ["admin"], icon: <IoScan /> },
        { to: "/user/admin/search", label: "Admin Search", authTypes: ["admin"], icon: <IoSearch /> },
        { to: "/user/admin/judges", label: "Judge Search", authTypes: ["admin"], icon: <IoSearch /> },
    ];

    const userTypes = useContext(AuthContext).userTypes;
    const filteredLinks = links.filter(
        (link) => !link.authTypes || link.authTypes.some(type => userTypes.includes(type))
    );

    return (
        <AppBar position="static">
            <Container
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "64px",
                }}
            >
                <Toolbar disableGutters>
                    <Link
                        to="/user/home"
                        style={{ textDecoration: "none", color: "inherit" }}
                    >
                        <Typography
                            variant="h6"
                            noWrap
                            sx={{
                                mr: 2,
                                display: { xs: "none", sm: "flex" },
                                fontFamily: "monospace",
                                fontWeight: 700,
                                letterSpacing: ".3rem",
                                color: "inherit",
                                textDecoration: "none",
                            }}
                        >
                            IDEATHON
                        </Typography>
                    </Link>

                    {filteredLinks.map((link) => (
                        <Link
                            key={link.to}
                            to={link.to}
                            style={{ color: "white", margin: { xs: "5px", md: "10px" }, textDecoration: "none" }}
                        >
                            <MenuItem key={link.label}>
                                <div>
                                    <Typography sx={{ textAlign: "center", display: { xs: "none", md: "block" } }}>
                                        {link.label}
                                    </Typography>
                                    <Typography sx={{ fontSize: "1.5em", display: { sm: "block", md: "none" } }}>
                                        {link.icon}
                                    </Typography>
                                </div>
                            </MenuItem>
                        </Link>
                    ))}
                </Toolbar>
            </Container>
        </AppBar>
    );
}

export default Nav;
