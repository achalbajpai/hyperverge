import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

interface EmailRequest {
    to: string;
    subject: string;
    template: 'suggest_resources' | 'schedule_viva';
    studentName: string;
    flagDetails: {
        flagType: string;
        severity: string;
        confidence: number;
        analysis?: string;
    };
}

const EMAIL_TEMPLATES = {
    suggest_resources: {
        subject: '🎯 Learning Resources to Help You Excel',
        getHtmlContent: (studentName: string, flagDetails: any) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .footer { background: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; }
        .resource-card { border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 10px 0; }
        .btn { background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📚 Personalized Learning Resources</h1>
        <p>Enhance your skills with curated educational content</p>
    </div>
    
    <div class="content">
        <p>Dear ${studentName},</p>
        
        <p>We've identified some areas where additional learning resources could help you excel even further! Based on your recent assessment performance, we've curated some valuable resources specifically for you.</p>
        
        <div style="background: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0;">
            <strong>📊 Assessment Insights:</strong><br>
            <strong>Area:</strong> ${flagDetails.flagType}<br>
            <strong>Focus Level:</strong> ${flagDetails.severity}<br>
            <strong>Confidence Score:</strong> ${flagDetails.confidence}%
        </div>

        <h3>🎯 Recommended Learning Resources:</h3>
        
        <div class="resource-card">
            <h4>📖 Interactive Tutorials</h4>
            <p>Step-by-step guided learning modules tailored to strengthen your understanding in key concepts.</p>
            <a href="#" class="btn">Access Tutorials</a>
        </div>
        
        <div class="resource-card">
            <h4>🎥 Video Lectures</h4>
            <p>Expert-led video sessions covering fundamental and advanced topics in your subject area.</p>
            <a href="#" class="btn">Watch Videos</a>
        </div>
        
        <div class="resource-card">
            <h4>📝 Practice Exercises</h4>
            <p>Hands-on exercises and sample problems to reinforce your learning and build confidence.</p>
            <a href="#" class="btn">Start Practicing</a>
        </div>
        
        <div class="resource-card">
            <h4>👥 Study Groups</h4>
            <p>Connect with peers and participate in collaborative learning sessions.</p>
            <a href="#" class="btn">Join Group</a>
        </div>

        <p style="margin-top: 30px;">
            <strong>💡 Pro Tip:</strong> Regular practice and consistent study habits are the keys to mastering any subject. Take advantage of these resources at your own pace!
        </p>
        
        <p>If you have any questions about these resources or need additional support, please don't hesitate to reach out to your instructor or our academic support team.</p>
        
        <p>Best regards,<br>
        <strong>The Academic Excellence Team</strong></p>
    </div>
    
    <div class="footer">
        <p>This email was sent to help enhance your learning experience. For questions, contact support@sensai.edu</p>
    </div>
</body>
</html>`
    },
    
    schedule_viva: {
        subject: '🎯 Individual Assessment Session Scheduled',
        getHtmlContent: (studentName: string, flagDetails: any) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .footer { background: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; }
        .schedule-card { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .btn-primary { background: #ff6b6b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; }
        .btn-secondary { background: #74b9ff; color: white; padding: 8px 16px; text-decoration: none; border-radius: 5px; display: inline-block; }
        .highlight { background: #e17055; color: white; padding: 2px 6px; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎯 Individual Assessment Session</h1>
        <p>A personalized 2-minute academic discussion</p>
    </div>
    
    <div class="content">
        <p>Dear ${studentName},</p>
        
        <p>We would like to schedule a brief <span class="highlight">2-minute individual assessment session</span> with you. This is a standard academic procedure designed to:</p>
        
        <ul>
            <li>✅ Verify your understanding of key concepts</li>
            <li>✅ Provide personalized feedback on your performance</li>
            <li>✅ Address any questions you might have</li>
            <li>✅ Support your academic growth</li>
        </ul>
        
        <div style="background: #ffeaa7; border-left: 4px solid #f39c12; padding: 15px; margin: 20px 0;">
            <strong>📊 Session Context:</strong><br>
            <strong>Assessment Area:</strong> ${flagDetails.flagType}<br>
            <strong>Priority Level:</strong> ${flagDetails.severity}<br>
            <strong>Review Score:</strong> ${flagDetails.confidence}%
        </div>

        <div class="schedule-card">
            <h3>📅 Scheduling Your Session</h3>
            <p><strong>Duration:</strong> 2 minutes</p>
            <p><strong>Format:</strong> One-on-one discussion</p>
            <p><strong>Purpose:</strong> Academic clarification and support</p>
            
            <div style="margin: 20px 0;">
                <h4>Available Time Slots:</h4>
                <div style="display: grid; gap: 10px; margin-top: 15px;">
                    <a href="#" class="btn-secondary">📅 Tomorrow 10:00 AM - 10:05 AM</a>
                    <a href="#" class="btn-secondary">📅 Tomorrow 2:00 PM - 2:05 PM</a>
                    <a href="#" class="btn-secondary">📅 Day After Tomorrow 11:00 AM - 11:05 AM</a>
                </div>
            </div>
            
            <p style="margin-top: 20px;">
                <a href="#" class="btn-primary">📅 Schedule Now</a>
                <span style="margin: 0 10px;">or</span>
                <a href="#" class="btn-secondary">📞 Request Different Time</a>
            </p>
        </div>
        
        <div style="background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <h4 style="margin: 0 0 10px 0;">💡 What to Expect:</h4>
            <ul style="margin: 0;">
                <li>Brief discussion about your recent assessment</li>
                <li>Opportunity to clarify any concepts</li>
                <li>Personalized academic guidance</li>
                <li>No preparation required - just bring your curiosity!</li>
            </ul>
        </div>
        
        <p>This session is part of our commitment to ensuring every student receives the support they need to succeed academically.</p>
        
        <p>If you have any concerns or questions about this session, please don't hesitate to contact our academic support team.</p>
        
        <p>Looking forward to our productive discussion!</p>
        
        <p>Best regards,<br>
        <strong>The Academic Assessment Team</strong></p>
    </div>
    
    <div class="footer">
        <p>This is an academic support communication. For questions, contact assessment@sensai.edu</p>
    </div>
</body>
</html>`
    }
};

export async function POST(request: NextRequest) {
    try {
        const body: EmailRequest = await request.json();
        const { to, template, studentName, flagDetails } = body;

        if (!EMAIL_TEMPLATES[template]) {
            return NextResponse.json({ error: 'Invalid email template' }, { status: 400 });
        }

        const templateConfig = EMAIL_TEMPLATES[template];
        const htmlContent = templateConfig.getHtmlContent(studentName, flagDetails);

        console.log('📧 Sending email:', {
            to,
            subject: templateConfig.subject,
            template,
            studentName,
            flagDetails
        });

        // Use Ethereal Email for testing (creates test accounts automatically)
        // This creates a real email that you can view in browser
        const testAccount = await nodemailer.createTestAccount();

        const transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });

        // Send the actual email
        try {
            const info = await transporter.sendMail({
                from: '"Sensai Academic Team" <noreply@sensai.edu>',
                to: to,
                subject: templateConfig.subject,
                html: htmlContent,
            });

            console.log('✅ Email sent successfully!');
            console.log('📧 Preview URL:', nodemailer.getTestMessageUrl(info));
            console.log('🔗 You can view the email at the above URL');
        } catch (emailError) {
            console.error('❌ Email sending failed:', emailError);
            throw emailError;
        }

        return NextResponse.json({
            success: true,
            message: 'Email sent successfully',
            emailDetails: {
                to,
                subject: templateConfig.subject,
                template,
                sentAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error sending email:', error);
        return NextResponse.json(
            { error: 'Failed to send email' },
            { status: 500 }
        );
    }
}