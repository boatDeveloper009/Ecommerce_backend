import ErrorHandler from "../middlewares/errorMiddleware.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import bcrypt from "bcrypt";
import crypto from "crypto";

import database from "../database/db.js";

import { sendEmail } from "../utils/sendEmail.js";
import { sendToken } from "../utils/jwtToken.js";
import { generateResetPasswordToken } from "../utils/generateResetPasswordToken.js";
import { generateResetPasswordEmail } from "../utils/generateResetPasswordEmail.js"
import {v2 as cloudinary} from "cloudinary"





export const register = catchAsyncError(async (req, res, next) => {
    const { name, email, password } = req.body;

    // 1. Basic Validation
    if (!name || !email || !password) {
        return next(new ErrorHandler("Please provide all required fields", 400));
    }
    if (name.length < 3 || name.length > 30) {
        return next(new ErrorHandler("Name must be between 3 and 30 characters", 400));
    }
    if (password.length < 6 || password.length > 16) {
        return next(new ErrorHandler("Password must be at least 6 characters or max of 16 characters", 400));
    }

    // 2. Check for existing user and cooldown
    const userResult = await database.query(
        `SELECT is_verified, otp_last_sent FROM users WHERE email = $1`,
        [email]
    );

    if (userResult.rows.length > 0) {
        const user = userResult.rows[0];

        if (user.is_verified) {
            return res.status(200).json({
                success: true,
                message: "User already registered. Please log in.",
            });
        }

        const lastSent = user.otp_last_sent;
        if (lastSent && Date.now() - new Date(lastSent).getTime() < 2 * 60 * 1000) {
            return next(new ErrorHandler("Please wait before requesting another OTP", 429));
        }
    }

    // 3. OTP generation
    const otp = crypto.randomInt(100000, 999999).toString();
    
    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    // Hash password ONLY for new user
    const hashedPassword = await bcrypt.hash(password, 10)


    // 4. Atomic upsert
    const upsertQuery = `
        INSERT INTO users (name, email, password, otp, otp_expiry, otp_last_sent)
        VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes', NOW())
        ON CONFLICT (email)
        DO UPDATE SET
            name = EXCLUDED.name,
            password = EXCLUDED.password,
            otp = EXCLUDED.otp,
            otp_expiry = EXCLUDED.otp_expiry,
            otp_last_sent = EXCLUDED.otp_last_sent
        WHERE users.is_verified = FALSE
        RETURNING id;
    `;

    const result = await database.query(
        upsertQuery,
        [name, email, hashedPassword, hashedOtp]
    );

    if (result.rows.length === 0) {
        return res.status(200).json({
            success: true,
            message: "User already registered. Please log in.",
        });
    }

    // 5. Send email
    await sendEmail({
        email,
        subject: "Verify Your Email",
        message: generateEmail(otp),
    });

    res.status(200).json({
        success: true,
        message: "If this email is eligible, an OTP has been sent."
    });
});


export const generateEmail = (otp) => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Email Verification</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
            <td align="center" style="padding:30px 0;">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:6px; padding:30px;">
                    <tr>
                        <td align="center">
                            <h2 style="color:#333;">Verify Your Email</h2>
                        </td>
                    </tr>
                    <tr>
                        <td style="color:#555; font-size:15px; line-height:1.6;">
                            <p>Hello 👋,</p>
                            <p>Please use the OTP below to verify your email address:</p>

                            <p style="text-align:center;">
                                <span style="font-size:24px; letter-spacing:4px; background:#f0f2f5; padding:12px 24px; border-radius:6px; font-weight:bold;">
                                    ${otp}
                                </span>
                            </p>

                            <p>This OTP is valid for <strong>10 minutes</strong>.</p>

                            <p>If you didn’t request this, you can ignore this email.</p>

                            <p>
                                Regards,<br>
                                <strong>The Support Team</strong>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
};

export const verifyEmail = catchAsyncError(async (req, res, next) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return next(new ErrorHandler("Please provide both email and OTP", 400));
    }

    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    // query to verify OTP
    const query = `
        UPDATE users
        SET
            is_verified = CASE
            WHEN otp = $2
            AND otp_expiry > NOW()
            AND otp_attempts < 5
            THEN TRUE
            ELSE is_verified
            END,
            
            otp_attempts = CASE
            WHEN otp = $2 AND otp_expiry > NOW()
            THEN 0
            WHEN otp != $2 OR otp_expiry <= NOW()
            THEN LEAST(otp_attempts + 1, 5)
            ELSE otp_attempts
            END,
            
           is_blocked = CASE
                WHEN (otp != $2 OR otp_expiry <= NOW())
                AND otp_attempts + 1 >= 5
                THEN TRUE
                ELSE is_blocked
                END,
            
            otp = CASE
            WHEN otp = $2 AND otp_expiry > NOW() 
            THEN NULL
            ELSE otp
            END,
            
            otp_expiry = CASE
            WHEN otp = $2 AND otp_expiry > NOW() 
            THEN NULL
            ELSE otp_expiry
            END
            
            WHERE email = $1
            AND is_blocked = FALSE
            AND is_verified = FALSE
            RETURNING id, email, role, is_verified, is_blocked, otp_attempts;`;


    const result = await database.query(query, [email, hashedOtp]);

    if (result.rows.length === 0) {
        // Determine if user exists and the reason for failure
        const userCheck = await database.query(`
            SELECT is_verified, is_blocked FROM users WHERE email = $1
            `, [email]);

        if (userCheck.rows.length === 0) {
            return next(new ErrorHandler("user not found", 404))
        }
        const { is_verified, is_blocked } = userCheck.rows[0];

        if (is_verified) {
            return next(new ErrorHandler("User already verified. Please log in.", 400))
        }
        if (is_blocked) {
            return next(new ErrorHandler("Account is blocked due to too many incorrect OTP attempts.", 403))
        }
        return next(new ErrorHandler("Invalid OTP or OTP expired.", 400));
    }

    const user = result.rows[0]

    // Handle the case where the user just got blocked by THIS attempt
    if (user.is_blocked) {
        return next(new ErrorHandler("Too many failed attempts. Account blocked.", 403));
    }

    // Handle incorrect OTP (attempts < 5)
    if (!user.is_verified) {
        return next(new ErrorHandler(`Invalid or expired OTP. ${5 - user.otp_attempts} attempts left.`, 400));
    }

    // Successful verification
    sendToken(user, 200, "Verification successful", res);
})



export const login = catchAsyncError(async (req, res, next) => {
    const { email, password } = req.body;

    // Check for missing fields
    if (!email || !password) {
        return next(new ErrorHandler("Please provide both email and password", 400));
    }
    // Find user by email
    const userResult = await database.query(
        `
        SELECT id, name, email, password, role, is_verified, is_blocked
        FROM users
        WHERE email = $1
        `,
        [email]
    );

    if (userResult.rows.length === 0) {
        return next(new ErrorHandler("Invalid email or password", 401));
    }

    const user = userResult.rows[0];

    if (user.is_blocked) {
        return next(new ErrorHandler("Your account is blocked. Please try again later.", 403));
    }

    if (!user.is_verified) {
        return next(new ErrorHandler("Please verify your email before logging in", 403));
    }

    // Compare passwords
    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
        const updateQuery = `
                UPDATE users
                SET
                    login_attempts = login_attempts + 1,
                    last_login_attempt = NOW(),
                    is_blocked = CASE
                        WHEN login_attempts + 1 >= 5 THEN TRUE
                        ELSE is_blocked
                    END
                WHERE id = $1
                RETURNING is_blocked, login_attempts;
        `
        const updateResult = await database.query(updateQuery, [user.id])
        const updatedUser = updateResult.rows[0];

        if (updatedUser.is_blocked) {
            return next(new ErrorHandler("Too many failed login attempts. Your account is now blocked.", 403));
        }

        return next(new ErrorHandler(`Invalid email or password. ${5 - updatedUser.login_attempts} attempts left.`, 401));
    }

    await database.query(`
            UPDATE users
            SET
                login_attempts = 0,
                last_login_attempt = NOW()
            WHERE id = $1
        `, [user.id])

    sendToken(user, 200, "Login successful", res);
})


export const getUser = catchAsyncError(async (req, res, next) => {
    const { user } = req;
    res.status(200).json({
        success: true,
        user
    })
})


export const logout = catchAsyncError(async (req, res, next) => {
    res.status(200).cookie("token", "", {
        expires: new Date(Date.now()),
        httpOnly: true,
        secure: true,
        sameSite: "None"
    }).json({
        success: true,
        message: "Logged out successfully"
    })
})

export const forgotPassword = catchAsyncError(async (req, res, next) => {
    const { email } = req.body;
    const { frontendUrl } = req.query;

    const userResult = await database.query(`SELECT reset_password_token, id, email, reset_password_expire, name FROM users WHERE email = $1`, [email])

    if (userResult.rows.length === 0) {
        return next(new ErrorHandler("User not found", 404))
    }

    const user = userResult.rows[0];

    const { resetToken, resetPasswordTokenExpire, hashedToken } = generateResetPasswordToken()

    await database.query(`UPDATE users SET reset_password_token = $1, reset_password_expire = to_timestamp($2) WHERE email=$3`,
        [hashedToken, resetPasswordTokenExpire / 1000, email]
    )

    const resetPasswordUrl = `${frontendUrl}/password/reset/${resetToken}`;
    const message = generateResetPasswordEmail(resetPasswordUrl);

    try {
        sendEmail({
            email: user.email,
            subject: "Password Reset Request",
            message
        })
        res.status(200).json({
            success: true,
            message: `Password reset email sent to your mail`
        })
    } catch (error) {
        await database.query(`UPDATE users SET reset_password_token = NULL, reset_password_expire = NULL WHERE email = $1`,
            [email]
        )
        return next(new ErrorHandler("email could not be sent", 500))
    }
})

export const resetPassword = catchAsyncError(async (req, res, next) => {
    const { token } = req.params
    const resetPasswordToken = crypto.createHash("sha256").update(token).digest("hex")
    const user = await database.query(`
            SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expire > NOW()
        `, [resetPasswordToken])


    if (user.rows.length === 0) {
        return next(new ErrorHandler("Invalid or expired reset token.", 400))
    }
    if (req.body.password !== req.body.confirmPassword) {
        return next(new ErrorHandler("Password and confirm password do not match", 400))
    }
    if (req.body.password.length < 6 || req.body.password.length > 16 ||
        req.body.confirmPassword.length < 6 || req.body.confirmPassword.length > 16
    ) {
        return next(new ErrorHandler("Password must be between 6 and 16 characters", 400))
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10)

    const updatedUser = await database.query(`
        UPDATE users SET password = $1, reset_password_token = NULL, reset_password_expire = NULL WHERE id = $2 RETURNING *
        `, [hashedPassword, user.rows[0].id])

    sendToken(updatedUser.rows[0], 200, "Password reset successfull", res)
})

export const updatePassword = catchAsyncError(async (req, res, next) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmNewPassword) {
        return next(new ErrorHandler("Please provide all requires fields.", 400))
    }

    const isPasswordMatch = await bcrypt.compare(currentPassword, req.user.password)
    if (!isPasswordMatch) {
        return next(new ErrorHandler("Current password is incorrect", 401))
    }


    if (newPassword.length < 6 || newPassword.length > 16 ||
        confirmNewPassword.length < 6 || confirmNewPassword.length > 16
    ) {
        return next(new ErrorHandler("Password must be between 6 and 16 characters", 400))
    }


    if (newPassword !== confirmNewPassword) {
        return next(new ErrorHandler("Password and confirm password do not match", 400))
    }

    if (req.user.is_blocked) {
        return next(new ErrorHandler("Account blocked. Cannot update password.", 403));
    }




    const hashedPassword = await bcrypt.hash(newPassword, 10)

    await database.query(`
        UPDATE users SET password = $1 WHERE id = $2
        `, [hashedPassword, req.user.id])

    res.status(200).json({
        success: true,
        message: "Password updated successfully"
    })
})

export const updateProfile = catchAsyncError(async (req, res, next)=>{
    const {name, email} = req.body;

    if(!name || !email){
        return next(new ErrorHandler("Please provide all required fields",400));
    }

    if(name.trim().length === 0 || email.trim().length === 0){
        return next(new ErrorHandler("Fields cannot be empty",400));
    }

    let avatarData = {}

    if(req.files && req.files.avatar){
        const {avatar} = req.files;

        if(req.user?.avatar?.public_id){
            await cloudinary.uploader.destroy(req.user.avatar.public_id)
        }

        const newProfileImage = await cloudinary.uploader.upload(avatar.tempFilePath,
            {
                folder: "Ecommerce_Avatars",
                width: 150,
                crop: "scale"
            }
        )

        avatarData = {
            public_id: newProfileImage.public_id,
            url: newProfileImage.secure_url
        }
    }

    let user;
    if(Object.keys(avatarData).length === 0){
        user = await database.query(`
            UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *
            `, [name, email, req.user.id])
    }else{
        user = await database.query(`
            UPDATE users SET name = $1, email = $2, avatar = $3 WHERE id = $4 RETURNING *
            `, [name, email, avatarData, req.user.id])
    }

    res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        user: user.rows[0]
    })
})