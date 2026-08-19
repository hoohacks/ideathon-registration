import { AppBar, Box, Container, Toolbar, Tooltip, Typography } from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../App";
import { FaUser, FaGavel } from "react-icons/fa";
import {
    IoHome,
    IoQrCodeOutline,
    IoScan,
    IoSearch,
    IoPeople,
    IoStatsChart,
} from "react-icons/io5";
import { RiTeamFill } from "react-icons/ri";

// Admin links sit in their own group on the right, so the bar reads as "what I
// do" and "what I run" instead of one undifferentiated row of nine items.
const LINKS = [
    { to: "/user/home", label: "Home", icon: <IoHome /> },
    { to: "/user/judging", label: "Judging", authTypes: ["judge", "admin"], icon: <FaGavel /> },
    { to: "/user/team", label: "Team", authTypes: ["competitor"], icon: <RiTeamFill /> },
    { to: "/user/checkin", label: "Check In", authTypes: ["competitor", "judge"], icon: <IoQrCodeOutline /> },
    { to: "/user/profile", label: "Profile", icon: <FaUser /> },
    { to: "/user/admin/scan", label: "Scan", authTypes: ["admin"], icon: <IoScan />, group: "admin" },
    { to: "/user/admin/search", label: "Competitors", authTypes: ["admin"], icon: <IoSearch />, group: "admin" },
    { to: "/user/admin/judges", label: "Judges", authTypes: ["admin"], icon: <IoPeople />, group: "admin" },
    { to: "/user/admin/teams", label: "Teams", authTypes: ["admin"], icon: <RiTeamFill />, group: "admin" },
    { to: "/user/admin/metrics", label: "Metrics", authTypes: ["admin"], icon: <IoStatsChart />, group: "admin" },
];

function NavLink({ link, active }) {
    return (
        <Tooltip title={link.label} enterDelay={700}>
            <Box
                component={Link}
                to={link.to}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    px: 1.25,
                    py: 0.75,
                    borderRadius: 1.5,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    fontSize: "0.875rem",
                    color: active ? "text.primary" : "text.secondary",
                    bgcolor: active ? "background.default" : "transparent",
                    fontWeight: active ? 600 : 500,
                    // colour change only: no lift, no scale
                    "&:hover": { color: "text.primary", bgcolor: "background.default" },
                }}
            >
                <Box component="span" sx={{ display: "flex", fontSize: "1.05rem" }}>
                    {link.icon}
                </Box>
                <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
                    {link.label}
                </Box>
            </Box>
        </Tooltip>
    );
}

function Nav() {
    const { pathname } = useLocation();
    const userTypes = useContext(AuthContext)?.userTypes ?? [];

    const visible = LINKS.filter(
        (link) => !link.authTypes || link.authTypes.some((type) => userTypes.includes(type))
    );
    const main = visible.filter((link) => link.group !== "admin");
    const admin = visible.filter((link) => link.group === "admin");

    const isActive = (to) =>
        to === "/user/home" ? pathname === to : pathname.startsWith(to);

    return (
        <AppBar position="sticky">
            <Container maxWidth={false} sx={{ maxWidth: 1280 }}>
                <Toolbar disableGutters sx={{ minHeight: { xs: 56, sm: 60 }, gap: 1 }}>
                    <Typography
                        component={Link}
                        to="/user/home"
                        variant="h6"
                        sx={{
                            mr: 1,
                            color: "text.primary",
                            textDecoration: "none",
                            display: { xs: "none", sm: "block" },
                        }}
                    >
                        Ideathon
                    </Typography>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, minWidth: 0, overflowX: "auto" }}>
                        {main.map((link) => (
                            <NavLink key={link.to} link={link} active={isActive(link.to)} />
                        ))}
                    </Box>

                    {admin.length > 0 && (
                        <>
                            <Box sx={{ flexGrow: 1 }} />
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 0.25,
                                    pl: 1,
                                    minWidth: 0,
                                    overflowX: "auto",
                                    borderLeft: 1,
                                    borderColor: "divider",
                                }}
                            >
                                {admin.map((link) => (
                                    <NavLink key={link.to} link={link} active={isActive(link.to)} />
                                ))}
                            </Box>
                        </>
                    )}
                </Toolbar>
            </Container>
        </AppBar>
    );
}

export default Nav;
