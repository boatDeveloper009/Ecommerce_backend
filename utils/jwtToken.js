import jwt from "jsonwebtoken";


export const sendToken = (user, statusCode, message, res)=>{
    const token = jwt.sign({ id: user.id}, process.env.JWT_SECRET_KEY, {
        expiresIn:  process.env.JWT_EXPIRES_IN
    })

    const safeUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
    };

    res.status(statusCode).cookie("token", token, {
        expires: new Date(Date.now() + process.env.COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
        httpOnly: true,
        secure: true,
        sameSite: "None"
    }).json({
        success: true,
        message,
        user: safeUser,
    })
}