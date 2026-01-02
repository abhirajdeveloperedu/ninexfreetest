export default async function handler(req, res) {
    // This endpoint is the DESTINATION URL for your shortener
    // After user completes shortener, they land here and get redirected to main page

    const { step } = req.query;

    if (!step) {
        return res.redirect('/?error=missing_step');
    }

    console.log(`✅ Callback: Step ${step} completed`);

    // Redirect to homepage with verification status
    return res.redirect(`/?verified=${step}`);
}
