/**
 * Seed Script for Initial Data
 * Creates sample instructors and evaluation forms for testing
 * 
 * Usage: node backend/scripts/seedInitialData.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Instructor = require('../models/Instructor');
const User = require('../models/User');
const EvaluationForm = require('../models/EvaluationForm');

const SAMPLE_INSTRUCTORS = [
  {
    name: 'Dr. John Smith',
    email: 'john.smith@buksu.edu.ph',
    department: 'Information Technology',
    username: 'jsmith'
  },
  {
    name: 'Prof. Maria Garcia',
    email: 'maria.garcia@buksu.edu.ph',
    department: 'Information Technology',
    username: 'mgarcia'
  },
  {
    name: 'Dr. Robert Johnson',
    email: 'robert.johnson@buksu.edu.ph',
    department: 'Computer Science',
    username: 'rjohnson'
  },
  {
    name: 'Prof. Sarah Williams',
    email: 'sarah.williams@buksu.edu.ph',
    department: 'Information Technology',
    username: 'swilliams'
  },
  {
    name: 'Dr. Michael Brown',
    email: 'michael.brown@buksu.edu.ph',
    department: 'Computer Science',
    username: 'mbrown'
  }
];

const SAMPLE_EVALUATION_FORMS = [
  {
    title: 'Midterm Evaluation Form - Semester 1, AY 2024-2025',
    description: 'Official midterm evaluation form for all IT instructors',
    isActive: true
  },
  {
    title: 'Final Evaluation Form - Semester 1, AY 2024-2025',
    description: 'Official final evaluation form for all IT instructors',
    isActive: true
  }
];

async function seedInitialData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Seed Instructors
    console.log('\n📚 Seeding Instructors...');
    let instructorsCreated = 0;
    let instructorsSkipped = 0;

    for (const instructorData of SAMPLE_INSTRUCTORS) {
      const existingInstructor = await Instructor.findOne({ 
        email: instructorData.email.toLowerCase().trim() 
      });

      if (existingInstructor) {
        console.log(`   ⏭️  Skipped: ${instructorData.name} (already exists)`);
        instructorsSkipped++;
        continue;
      }

      // Create instructor
      const instructor = new Instructor({
        name: instructorData.name,
        email: instructorData.email.toLowerCase().trim(),
        department: instructorData.department,
        username: instructorData.username,
        isArchived: false
      });
      await instructor.save();

      // Create user account for instructor
      const defaultPassword = 'Instructor123!'; // Default password for testing
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      const instructorUser = new User({
        email: instructorData.email.toLowerCase().trim(),
        password: hashedPassword,
        role: 'instructor',
        authProvider: 'local',
        isArchived: false
      });
      await instructorUser.save();

      console.log(`   ✅ Created: ${instructorData.name} (${instructorData.email})`);
      console.log(`      Username: ${instructorData.username}`);
      console.log(`      Default Password: ${defaultPassword}`);
      instructorsCreated++;
    }

    console.log(`\n   📊 Summary: ${instructorsCreated} created, ${instructorsSkipped} skipped`);

    // Seed Evaluation Forms
    console.log('\n📋 Seeding Evaluation Forms...');
    let formsCreated = 0;
    let formsSkipped = 0;

    // Get a dean user to use as createdBy
    const deanUser = await User.findOne({ role: 'dean' });
    const createdBy = deanUser ? deanUser._id : null;

    for (const formData of SAMPLE_EVALUATION_FORMS) {
      const existingForm = await EvaluationForm.findOne({ 
        title: formData.title 
      });

      if (existingForm) {
        console.log(`   ⏭️  Skipped: ${formData.title} (already exists)`);
        formsSkipped++;
        continue;
      }

      const evaluationForm = new EvaluationForm({
        title: formData.title,
        description: formData.description,
        isActive: formData.isActive,
        createdBy: createdBy,
        questions: [] // Empty questions - can be added later via UI
      });

      await evaluationForm.save();
      console.log(`   ✅ Created: ${formData.title}`);
      formsCreated++;
    }

    console.log(`\n   📊 Summary: ${formsCreated} created, ${formsSkipped} skipped`);

    // Final Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ Seeding Complete!');
    console.log('='.repeat(60));
    console.log(`\n📚 Instructors: ${instructorsCreated} created, ${instructorsSkipped} skipped`);
    console.log(`📋 Evaluation Forms: ${formsCreated} created, ${formsSkipped} skipped`);
    console.log('\n💡 Note: Default password for all instructors is: Instructor123!');
    console.log('   Instructors should change their password after first login.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding initial data:', error);
    process.exit(1);
  }
}

// Run the seed function
seedInitialData();

