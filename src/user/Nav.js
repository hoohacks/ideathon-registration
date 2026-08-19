import { useContext, useState } from "react";
import {
    AppBar,
    Avatar,
    Box,
    Button,
    Container,
    Divider,
    Drawer,
    IconButton,
    ListItemButton,
    Menu,
    MenuItem,
    Stack,
    Toolbar,
    Typography,
} from "@mui/material";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { IoChevronDown, IoMenu, IoClose } from "react-icons/io5";
import { AuthContext } from "../App";
import { auth } from "../firebase";

/**
 * Primary links stay as plain text. Admin pages collapse into one menu, and
 * the account sits on the far right behind an avatar.
 *
 * The previous version put all ten destinations in a single flat row, each
 * with an icon from a different icon set at the same weight as its label,
 * which read as noise rather than navigation.
 */
const PRIMARY = [
    { to: "/user/home", label: "Home" },
    { to: "/user/judging", label: "Judging", roles: ["judge", "admin"] },
    { to: "/user/team", label: "Team", roles: ["competitor"] },
    { to: "/user/checkin", label: "Check in", roles: ["competitor", "judge"] },
];

const ADMIN = [
    { to: "/user/admin/scan", label: "Scan check-in" },
    { to: "/user/admin/search", label: "Competitors" },
    { to: "/user/admin/judges", label: "Judges" },
    { to: "/user/admin/teams", label: "Teams" },
    { to: "/user/admin/metrics", label: "Metrics" },
];

function initialsOf(userData) {
    const first = userData?.firstName?.[0] ?? "";
    const last = userData?.lastName?.[0] ?? "";
    return (first + last).toUpperCase() || "?";
}

function TopLink({ to, label, active }) {
    return (
        <Box
            component={Link}
            to={to}
            sx={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                height: 60,
                px: 1.5,
                fontSize: "0.9375rem",
                fontWeight: active ? 600 : 500,
                textDecoration: "none",
                color: active ? "text.primary" : "text.secondary",
                "&:hover": { color: "text.primary" },
                // a 2px rule pinned to the bottom of the bar, rather than a
                // grey pill that barely reads against white
                "&::after": active
                    ? {
                          content: '""',
                          position: "absolute",
                          left: 12,
                          right: 12,
                          bottom: -1,
                          height: 2,
                          borderRadius: 1,
                          bgcolor: "primary.main",
                      }
                    : undefined,
            }}
        >
            {label}
        </Box>
    );
}

function Nav() {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const context = useContext(AuthContext);
    const userTypes = context?.userTypes ?? [];
    const userData = context?.userData;

    const [adminAnchor, setAdminAnchor] = useState(null);
    const [accountAnchor, setAccountAnchor] = useState(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const isAdmin = userTypes.includes("admin");
    const primary = PRIMARY.filter(
        (link) => !link.roles || link.roles.some((role) => userTypes.includes(role))
    );

    const isActive = (to) =>
        to === "/user/home" ? pathname === to : pathname.startsWith(to);
    const adminActive = pathname.startsWith("/user/admin");

    const go = (to) => {
        setAdminAnchor(null);
        setAccountAnchor(null);
        setDrawerOpen(false);
        navigate(to);
    };

    const logOut = async () => {
        setAccountAnchor(null);
        setDrawerOpen(false);
        try {
            await auth.signOut();
            navigate("/login", { replace: true });
        } catch (error) {
            console.error("Error during logout:", error);
        }
    };

    const fullName = [userData?.firstName, userData?.lastName].filter(Boolean).join(" ");

    return (
        <AppBar position="sticky">
            <Container maxWidth="lg">
                <Toolbar disableGutters sx={{ minHeight: { xs: 56, sm: 60 }, gap: 1 }}>
                    <IconButton
                        onClick={() => setDrawerOpen(true)}
                        sx={{ display: { xs: "inline-flex", md: "none" }, ml: -1 }}
                        aria-label="Open menu"
                    >
                        <IoMenu />
                    </IconButton>

                    <Typography
                        component={Link}
                        to="/user/home"
                        sx={{
                            fontSize: "1.0625rem",
                            fontWeight: 700,
                            letterSpacing: "-0.02em",
                            color: "text.primary",
                            textDecoration: "none",
                            mr: { md: 2 },
                        }}
                    >
                        Ideathon
                    </Typography>

                    <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center" }}>
                        {primary.map((link) => (
                            <TopLink key={link.to} {...link} active={isActive(link.to)} />
                        ))}
                    </Box>

                    <Box sx={{ flexGrow: 1 }} />

                    {isAdmin && (
                        <Button
                            onClick={(e) => setAdminAnchor(e.currentTarget)}
                            endIcon={<IoChevronDown size={14} />}
                            disableRipple
                            sx={{
                                position: "relative",
                                display: { xs: "none", md: "inline-flex" },
                                height: 60,
                                borderRadius: 0,
                                px: 1.5,
                                color: adminActive ? "text.primary" : "text.secondary",
                                fontWeight: adminActive ? 600 : 500,
                                fontSize: "0.9375rem",
                                "&:hover": { bgcolor: "transparent", color: "text.primary" },
                                "&::after": adminActive
                                    ? {
                                          content: '""',
                                          position: "absolute",
                                          left: 12,
                                          right: 12,
                                          bottom: -1,
                                          height: 2,
                                          borderRadius: 1,
                                          bgcolor: "primary.main",
                                      }
                                    : undefined,
                            }}
                        >
                            Admin
                        </Button>
                    )}

                    <IconButton
                        onClick={(e) => setAccountAnchor(e.currentTarget)}
                        sx={{ p: 0.5 }}
                        aria-label="Account"
                    >
                        <Avatar
                            sx={{
                                width: 32,
                                height: 32,
                                fontSize: "0.8125rem",
                                fontWeight: 600,
                                bgcolor: "secondary.main",
                            }}
                        >
                            {initialsOf(userData)}
                        </Avatar>
                    </IconButton>
                </Toolbar>
            </Container>

            {/* Admin pages, collapsed out of the main row */}
            <Menu
                anchorEl={adminAnchor}
                open={Boolean(adminAnchor)}
                onClose={() => setAdminAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                slotProps={{ paper: { variant: "outlined", sx: { minWidth: 200, mt: 0.5 } } }}
            >
                {ADMIN.map((link) => (
                    <MenuItem
                        key={link.to}
                        selected={pathname.startsWith(link.to)}
                        onClick={() => go(link.to)}
                    >
                        {link.label}
                    </MenuItem>
                ))}
            </Menu>

            <Menu
                anchorEl={accountAnchor}
                open={Boolean(accountAnchor)}
                onClose={() => setAccountAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                slotProps={{ paper: { variant: "outlined", sx: { minWidth: 220, mt: 0.5 } } }}
            >
                <Box sx={{ px: 2, py: 1 }}>
                    <Typography sx={{ fontWeight: 600 }}>{fullName || "Signed in"}</Typography>
                    {userData?.email && (
                        <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                            {userData.email}
                        </Typography>
                    )}
                </Box>
                <Divider />
                <MenuItem onClick={() => go("/user/profile")}>Profile</MenuItem>
                <MenuItem onClick={logOut}>Log out</MenuItem>
            </Menu>

            {/* Mobile */}
            <Drawer
                anchor="left"
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                slotProps={{ paper: { sx: { width: 268 } } }}
            >
                <Stack direction="row" alignItems="center" sx={{ p: 2, pb: 1 }}>
                    <Typography sx={{ flex: 1, fontWeight: 700, fontSize: "1.0625rem" }}>
                        Ideathon
                    </Typography>
                    <IconButton onClick={() => setDrawerOpen(false)} aria-label="Close menu">
                        <IoClose />
                    </IconButton>
                </Stack>

                <Box sx={{ px: 1, pb: 1 }}>
                    {primary.map((link) => (
                        <ListItemButton
                            key={link.to}
                            selected={isActive(link.to)}
                            onClick={() => go(link.to)}
                            sx={{ borderRadius: 1.5 }}
                        >
                            {link.label}
                        </ListItemButton>
                    ))}
                </Box>

                {isAdmin && (
                    <>
                        <Divider />
                        <Typography
                            variant="body2"
                            sx={{ px: 2, pt: 1.5, pb: 0.5, textTransform: "uppercase", fontSize: "0.7rem", letterSpacing: "0.06em" }}
                        >
                            Admin
                        </Typography>
                        <Box sx={{ px: 1, pb: 1 }}>
                            {ADMIN.map((link) => (
                                <ListItemButton
                                    key={link.to}
                                    selected={pathname.startsWith(link.to)}
                                    onClick={() => go(link.to)}
                                    sx={{ borderRadius: 1.5 }}
                                >
                                    {link.label}
                                </ListItemButton>
                            ))}
                        </Box>
                    </>
                )}

                <Box sx={{ flexGrow: 1 }} />
                <Divider />
                <Box sx={{ px: 1, py: 1 }}>
                    <ListItemButton onClick={() => go("/user/profile")} sx={{ borderRadius: 1.5 }}>
                        Profile
                    </ListItemButton>
                    <ListItemButton onClick={logOut} sx={{ borderRadius: 1.5 }}>
                        Log out
                    </ListItemButton>
                </Box>
            </Drawer>
        </AppBar>
    );
}

export default Nav;
