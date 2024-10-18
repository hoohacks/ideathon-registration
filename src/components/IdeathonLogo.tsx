import React, { CSSProperties } from 'react';
import { Link } from "@mui/material";
import Logo from "../images/logo.png";
import { gridStyles } from '../styles/registrationStyles.tsx';

const IdeathonLogo = ({ theme }) => {
    return (
        <Link
            href="https://ideathon.hoohacks.io"
            sx={{
                maxWidth: "582px",
                [theme.breakpoints.down("md")]: {
                    maxWidth: "402px",
                },
            }}
        >
            <img
                src={Logo}
                style={{
                    ...(gridStyles.image as CSSProperties),
                    [theme.breakpoints.down("md")]: {
                        width: "402px",
                    },
                } as CSSProperties}
            />
        </Link>
    )
}

export default IdeathonLogo;